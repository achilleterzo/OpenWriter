import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ActivityBar from './components/ActivityBar.jsx'
import AiChatPanel from './components/AiChatPanel.jsx'
import BrowserPane from './components/BrowserPane.jsx'
import ContextMenu, { ContextMenuContext, modKey } from './components/ContextMenu.jsx'
import DocumentPane from './components/DocumentPane.jsx'
import FileExplorer from './components/FileExplorer.jsx'
import HistoryPanel from './components/HistoryPanel.jsx'
import NotesPanel from './components/NotesPanel.jsx'
import OutlinePanel from './components/OutlinePanel.jsx'
import PanelResizer from './components/PanelResizer.jsx'
import SettingsScreen from './components/SettingsScreen.jsx'
import TabBar from './components/TabBar.jsx'
import useDocumentFileCommands from './hooks/useDocumentFileCommands.js'
import { setAnnotations } from './lib/annotationExtension.js'
import { relativeToProject } from './lib/aiTools.js'
import { PANELS, clampWidth, fitLayout, loadLayout, maxWidthFor, saveLayout } from './lib/layout.js'

const electronAPI = window.electronAPI
const SAVE_DELAY_MS = 500
const baseName = (filePath) => filePath.split(/[\\/]/).filter(Boolean).at(-1) || filePath

// Riporta un percorso sotto il nuovo nome quando un file o una cartella viene rinominato.
const remapPath = (value, from, to) => {
  if (!value) return value
  if (value === from) return to
  return value.startsWith(`${from}\\`) || value.startsWith(`${from}/`) ? to + value.slice(from.length) : value
}
const isInside = (value, directory) => Boolean(value) && (value === directory || value.startsWith(`${directory}\\`) || value.startsWith(`${directory}/`))

let untitledCounter = 0
function createTab(document = null, id = crypto.randomUUID()) {
  if (!document) {
    untitledCounter += 1
    return { id, filePath: null, sourcePath: null, untitled: untitledCounter, title: `Senza titolo ${untitledCounter}`, content: '<h2>Inizia a scrivere</h2><p>Questo è il tuo nuovo documento.</p>', contentType: 'html', dirty: false }
  }
  // Solo i Markdown si possono risalvare nello stesso file: DOCX e PDF diventano nuovi documenti.
  const savable = document.format === 'markdown'
  return { id, filePath: savable ? document.filePath : null, sourcePath: document.filePath, title: baseName(document.filePath), content: document.content, contentType: document.contentType, dirty: false }
}

// La scheda del browser non è un documento: non ha editor, file né bozze, e non viene salvata nella sessione.
const createBrowserTab = () => ({ id: crypto.randomUUID(), kind: 'browser', title: 'Browser', filePath: null, sourcePath: null, dirty: false })
const isDocument = (tab) => tab && tab.kind !== 'browser'
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
const samePath = (left, right) => Boolean(left) && Boolean(right) && left.replace(/\\/g, '/').toLowerCase() === right.replace(/\\/g, '/').toLowerCase()

// Ricostruisce le schede dalla sessione salvata: le bozze tornano dal testo salvato, gli altri file dal disco.
async function restoreTabs(session) {
  const tabs = []
  for (const saved of session?.tabs || []) {
    try {
      // Il numero dei documenti senza titolo è un dato salvato, non si ricava dal titolo (che può cambiare con la lingua).
      if (Number.isInteger(saved.untitled)) untitledCounter = Math.max(untitledCounter, saved.untitled)
      if (saved.markdown !== undefined) {
        tabs.push({ id: saved.id, filePath: saved.filePath, sourcePath: saved.sourcePath, untitled: saved.untitled, title: saved.title, content: saved.markdown, contentType: 'markdown', dirty: Boolean(saved.dirty) })
      } else if (saved.sourcePath) {
        tabs.push(createTab(await electronAPI.reopenDocument(saved.sourcePath), saved.id))
      }
    } catch (error) {
      console.warn('Scheda non ripristinata', saved?.title, error)
    }
  }
  return tabs.length ? tabs : [createTab()]
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [tabs, setTabs] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [editors, setEditors] = useState({})
  const [project, setProject] = useState(null)
  const [sideTab, setSideTab] = useState('files')
  const [expandedPaths, setExpandedPaths] = useState(() => new Set())
  const [explorerRefresh, setExplorerRefresh] = useState(0)
  const [historyVersion, setHistoryVersion] = useState(0)
  const [status, setStatus] = useState('')
  const [screen, setScreen] = useState('editor')
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [conversationId, setConversationId] = useState(null)
  const [settingsVersion, setSettingsVersion] = useState(0)
  const [notes, setNotes] = useState([])
  const [notesVersion, setNotesVersion] = useState(0)
  const [findRequest, setFindRequest] = useState({ nonce: 0, replace: false })
  const [contextMenu, setContextMenu] = useState(null)
  const [layout, setLayout] = useState(loadLayout)
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)
  const layoutRef = useRef(layout)
  layoutRef.current = layout
  const [activeNoteId, setActiveNoteId] = useState(null)
  const browserControllers = useRef(new Map())
  const lastDocumentId = useRef(null)
  const lastBrowserId = useRef(null)

  const activeTab = tabs.find((tab) => tab.id === activeId) || tabs[0]
  if (isDocument(activeTab)) lastDocumentId.current = activeTab.id
  // Il documento "di contesto" è quello attivo, oppure l'ultimo usato quando in primo piano c'è il browser.
  const contextTab = isDocument(activeTab) ? activeTab : tabs.find((tab) => tab.id === lastDocumentId.current && isDocument(tab)) || tabs.find(isDocument)

  // Gli ultimi valori restano in un ref: serve a salvare la sessione anche dai timer e da beforeunload.
  const latest = useRef({})
  latest.current = { ready, tabs, activeId, editors, project, sideTab, expandedPaths, assistantOpen, conversationId, contextTabId: contextTab?.id }
  const saveTimer = useRef(null)

  const buildSession = useCallback(() => {
    const { tabs: currentTabs, activeId: currentActive, editors: currentEditors, sideTab: currentSide, expandedPaths: currentExpanded } = latest.current
    return {
      activeId: currentTabs.some((tab) => tab.id === currentActive && isDocument(tab)) ? currentActive : latest.current.contextTabId,
      sideTab: currentSide,
      expanded: [...currentExpanded],
      assistantOpen: latest.current.assistantOpen,
      conversationId: latest.current.conversationId,
      tabs: currentTabs.filter(isDocument).map((tab) => {
        const editor = currentEditors[tab.id]
        // Bozze e documenti mai salvati conservano il testo; gli altri si rileggono dal file.
        const keepText = (tab.dirty || !tab.sourcePath) && editor
        return {
          id: tab.id,
          filePath: tab.filePath,
          sourcePath: tab.sourcePath,
          title: tab.title,
          untitled: tab.untitled,
          dirty: tab.dirty,
          ...(keepText ? { markdown: editor.getMarkdown() } : {}),
        }
      }),
    }
  }, [])

  const flushSession = useCallback(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = null
    if (!electronAPI || !latest.current.ready) return
    electronAPI.saveSession(buildSession()).catch((error) => console.error(error))
  }, [buildSession])

  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(flushSession, SAVE_DELAY_MS)
  }, [flushSession])

  const applySession = useCallback(async (session) => {
    const restored = await restoreTabs(session)
    setTabs(restored)
    setActiveId(restored.some((tab) => tab.id === session?.activeId) ? session.activeId : restored[0].id)
    setSideTab(session && 'sideTab' in session ? session.sideTab : 'files')
    setExpandedPaths(new Set(session?.expanded || []))
    setAssistantOpen(Boolean(session?.assistantOpen))
    // Le conversazioni ora stanno in .ow/chat: quella salvata nella sessione dalle versioni precedenti viene importata una volta.
    let activeConversation = session?.conversationId ?? null
    if (Array.isArray(session?.chat) && session.chat.length && (await electronAPI.getProject())) {
      try {
        const imported = await electronAPI.createConversation({ title: 'Conversazione importata', messages: session.chat })
        activeConversation = imported.id
      } catch (error) {
        console.warn('Importazione della conversazione non riuscita', error)
      }
    }
    setConversationId(activeConversation)
  }, [])

  useEffect(() => {
    if (!electronAPI) return
    ;(async () => {
      setProject(await electronAPI.getProject())
      await applySession(await electronAPI.loadSession())
      setReady(true)
    })()
  }, [applySession])

  // Qualsiasi cambio di stato persistente salva la sessione; le digitazioni passano da markDirty.
  useEffect(() => {
    if (ready) scheduleSave()
  }, [ready, tabs, activeId, sideTab, expandedPaths, assistantOpen, conversationId, scheduleSave])

  useEffect(() => {
    const flushBeforeUnload = () => {
      if (!electronAPI || !latest.current.ready) return
      electronAPI.saveSessionSync(buildSession())
    }
    window.addEventListener('beforeunload', flushBeforeUnload)
    return () => window.removeEventListener('beforeunload', flushBeforeUnload)
  }, [buildSession])

  // Menu contestuale di editor e campi di testo (con i suggerimenti del correttore, che arrivano dal processo principale).
  useEffect(() => {
    if (!electronAPI) return undefined
    return electronAPI.onEditContextMenu((info) => {
      const items = []
      if (info.misspelledWord) {
        items.push(...info.suggestions.map((suggestion) => ({ label: suggestion, bold: true, onClick: () => electronAPI.replaceMisspelling(suggestion) })))
        if (!info.suggestions.length) items.push({ label: 'Nessun suggerimento', disabled: true })
        items.push({ label: `Aggiungi "${info.misspelledWord}" al dizionario`, onClick: () => electronAPI.addToDictionary(info.misspelledWord) }, { separator: true })
      }
      if (info.isEditable) items.push({ label: 'Taglia', hint: `${modKey}X`, disabled: !info.flags.canCut, onClick: () => electronAPI.editAction('cut') })
      items.push({ label: 'Copia', hint: `${modKey}C`, disabled: !info.flags.canCopy, onClick: () => electronAPI.editAction('copy') })
      if (info.isEditable) {
        items.push({ label: 'Incolla', hint: `${modKey}V`, disabled: !info.flags.canPaste, onClick: () => electronAPI.editAction('paste') }, { separator: true }, { label: 'Seleziona tutto', hint: `${modKey}A`, onClick: () => electronAPI.editAction('selectAll') })
      }
      setContextMenu({ x: info.x, y: info.y, items })
    })
  }, [])

  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Un file trascinato fuori dall'explorer non deve far navigare la finestra verso il file.
  useEffect(() => {
    const block = (event) => { if (Array.from(event.dataTransfer?.types || []).includes('Files')) event.preventDefault() }
    window.addEventListener('dragover', block)
    window.addEventListener('drop', block)
    return () => { window.removeEventListener('dragover', block); window.removeEventListener('drop', block) }
  }, [])

  const chooseProject = useCallback(async () => {
    // La sessione del progetto corrente viene salvata prima del cambio, poi si carica quella del nuovo progetto.
    flushSession()
    const chosen = await electronAPI.chooseProject()
    if (chosen === latest.current.project) return
    setReady(false)
    setProject(chosen)
    await applySession(await electronAPI.loadSession())
    setReady(true)
  }, [flushSession, applySession])

  useEffect(() => {
    if (!electronAPI) return undefined
    return electronAPI.onAppCommand((command) => {
      if (command === 'settings') setScreen('settings')
      if (command === 'open-project') chooseProject()
    })
  }, [chooseProject])

  const registerEditor = useCallback((id, editor) => {
    setEditors((current) => {
      if (!editor) {
        const { [id]: _removed, ...rest } = current
        return rest
      }
      return { ...current, [id]: editor }
    })
  }, [])

  const toggleExpanded = useCallback((directory) => {
    setExpandedPaths((current) => {
      const next = new Set(current)
      if (!next.delete(directory)) next.add(directory)
      return next
    })
  }, [])

  const workspace = useMemo(() => ({
    newTab() {
      const tab = createTab()
      setTabs((current) => [...current, tab])
      setActiveId(tab.id)
    },
    openDocument(document) {
      const existing = latest.current.tabs.find((tab) => tab.sourcePath === document.filePath)
      if (existing) { setActiveId(existing.id); return }
      const tab = createTab(document)
      setTabs((current) => [...current, tab])
      setActiveId(tab.id)
      setStatus('Aperto')
    },
    closeTab(id) {
      const current = latest.current.tabs
      const tab = current.find((item) => item.id === id)
      if (!tab) return
      if (tab.dirty && !window.confirm(`"${tab.title}" ha modifiche non salvate. Chiuderlo comunque?`)) return
      const remaining = current.filter((item) => item.id !== id)
      const next = remaining.some(isDocument) ? remaining : [...remaining, createTab()]
      setTabs(next)
      setActiveId((active) => {
        if (active !== id) return active
        const index = current.findIndex((item) => item.id === id)
        return (next[index] || next[next.length - 1]).id
      })
    },
    pathRenamed(from, to) {
      setTabs((current) => current.map((tab) => {
        const sourcePath = remapPath(tab.sourcePath, from, to)
        const filePath = remapPath(tab.filePath, from, to)
        if (sourcePath === tab.sourcePath && filePath === tab.filePath) return tab
        const title = tab.sourcePath && tab.title === baseName(tab.sourcePath) ? baseName(sourcePath) : tab.title
        return { ...tab, sourcePath, filePath, title }
      }))
      setExpandedPaths((current) => new Set([...current].map((item) => remapPath(item, from, to))))
      setHistoryVersion((value) => value + 1)
      setStatus('Rinominato')
    },
    // Le schede di un file eliminato restano aperte come documenti non salvati, così il testo non va perso.
    pathDeleted(target) {
      setTabs((current) => current.map((tab) => (isInside(tab.sourcePath, target) || isInside(tab.filePath, target) ? { ...tab, sourcePath: null, filePath: null, dirty: true } : tab)))
      setExpandedPaths((current) => new Set([...current].filter((item) => !isInside(item, target))))
      setHistoryVersion((value) => value + 1)
      setStatus('Spostato nel cestino')
    },
    requestFind(replace) {
      setFindRequest((current) => ({ nonce: current.nonce + 1, replace }))
    },
    openBrowser() {
      const tab = createBrowserTab()
      lastBrowserId.current = tab.id
      setTabs((current) => [...current, tab])
      setActiveId(tab.id)
    },
    setTitle(id, title) {
      setTabs((current) => current.map((tab) => (tab.id === id && title ? { ...tab, title } : tab)))
    },
    markDirty(id) {
      setTabs((current) => (current.some((tab) => tab.id === id && !tab.dirty) ? current.map((tab) => (tab.id === id ? { ...tab, dirty: true } : tab)) : current))
      scheduleSave()
    },
    markSaved(id, filePath) {
      setTabs((current) => current.map((tab) => (tab.id === id ? { ...tab, filePath, sourcePath: filePath, title: baseName(filePath), dirty: false } : tab)))
      setExplorerRefresh((value) => value + 1)
      setHistoryVersion((value) => value + 1)
    },
  }), [scheduleSave])

  const getEditor = useCallback((id) => editors[id], [editors])

  // Ctrl+F / Ctrl+H anche quando il menu nativo non intercetta il tasto.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
      const key = event.key.toLowerCase()
      if (key !== 'f' && key !== 'h') return
      event.preventDefault()
      workspace.requestFind(key === 'h')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [workspace])

  const registerBrowser = useCallback((id, controller) => {
    if (controller) browserControllers.current.set(id, controller)
    else browserControllers.current.delete(id)
  }, [])

  // Ponte per gli strumenti dell'assistente: legge sempre lo stato più recente tramite `latest`.
  const toolBridge = useMemo(() => {
    const toolBridge = {
    getDocument(relativePath) {
      const { tabs: currentTabs, editors: currentEditors, project: currentProject, contextTabId } = latest.current
      const documents = currentTabs.filter(isDocument)
      const wanted = relativePath ? `${currentProject}/${String(relativePath).replace(/\\/g, '/')}` : null
      const tab = wanted
        ? documents.find((item) => samePath(item.filePath, wanted) || samePath(item.sourcePath, wanted))
        : documents.find((item) => item.id === contextTabId)
      if (!tab) throw new Error(wanted ? `Il documento "${relativePath}" non è aperto in una scheda: chiedi all'utente di aprirlo` : 'Nessun documento aperto')
      if (!currentEditors[tab.id]) throw new Error('L\'editor del documento non è ancora pronto')
      return { tab, editor: currentEditors[tab.id] }
    },
    // Testo attuale dell'editor per un file del progetto aperto in una scheda (anche con modifiche non salvate).
    getOpenDocumentText(relativePath) {
      const { tabs: currentTabs, editors: currentEditors, project: currentProject } = latest.current
      if (!currentProject) return null
      const wanted = `${currentProject}/${String(relativePath).replace(/\\/g, '/')}`
      const tab = currentTabs.filter(isDocument).find((item) => samePath(item.filePath, wanted) || samePath(item.sourcePath, wanted))
      const editor = tab && currentEditors[tab.id]
      return editor ? { text: editor.getMarkdown(), dirty: tab.dirty } : null
    },
    activeDocumentPath() {
      const { tabs: currentTabs, project: currentProject, contextTabId } = latest.current
      const tab = currentTabs.find((item) => item.id === contextTabId)
      return tab?.filePath ? relativeToProject(currentProject, tab.filePath) : null
    },
    // Schede del browser, con indirizzo e titolo attuali (anche se l'utente ha navigato per conto suo).
    async listBrowserTabs() {
      const { tabs: currentTabs, activeId: current } = latest.current
      return currentTabs.filter((tab) => tab.kind === 'browser').map((tab, index) => ({
        number: index + 1,
        id: tab.id.slice(0, 6),
        active: tab.id === current,
        ...(browserControllers.current.get(tab.id)?.info() || { url: '', title: tab.title }),
      }))
    },
    // Sceglie la scheda su cui lavorare: quella indicata (numero o id), altrimenti la scheda browser in primo piano,
    // l'ultima usata o la prima. `create` ne apre una nuova se non ce n'è (o se `newTab`); `activate` la porta in primo piano.
    async getBrowser({ tab: reference, newTab = false, create = true, activate = true } = {}) {
      const list = latest.current.tabs.filter((item) => item.kind === 'browser')
      let target = null
      if (!newTab && reference !== undefined && reference !== null && String(reference).trim() !== '') {
        const key = String(reference).trim().toLowerCase().replace(/^(scheda|tab)\s*#?/, '')
        target = (/^\d+$/.test(key) ? list[Number(key) - 1] : null) || list.find((item) => item.id.toLowerCase().startsWith(key)) || null
        if (!target) throw new Error(`Scheda browser "${reference}" non trovata: usa browser_tabs per vedere quelle aperte`)
      } else if (!newTab) {
        target = list.find((item) => item.id === latest.current.activeId) || list.find((item) => item.id === lastBrowserId.current) || list[0] || null
      }
      let number = target ? list.indexOf(target) + 1 : 0
      if (!target) {
        if (!create && !newTab) throw new Error("Nessuna scheda del browser aperta: la può aprire l'utente (icona del globo) oppure tu con web_open o web_search, se la navigazione web è attiva")
        target = createBrowserTab()
        number = list.length + 1
        setTabs((current) => [...current, target])
      }
      lastBrowserId.current = target.id
      if (activate) setActiveId(target.id)
      for (let attempt = 0; attempt < 200; attempt += 1) {
        const controller = browserControllers.current.get(target.id)
        if (controller) return { controller, id: target.id, shortId: target.id.slice(0, 6), number }
        await sleep(50)
      }
      throw new Error('Il browser non è pronto')
    },
    // Schermata della parte visibile del documento (se non è in primo piano lo porta davanti e attende il ridisegno).
    async captureDocument(relativePath) {
      const { tab } = toolBridge.getDocument(relativePath)
      if (latest.current.activeId !== tab.id) {
        setActiveId(tab.id)
        await sleep(500)
      }
      const element = document.querySelector(`[data-document-scroll="${tab.id}"]`)
      if (!element) throw new Error('Il documento non è visibile')
      const { x, y, width, height } = element.getBoundingClientRect()
      return { title: tab.title, image: await electronAPI.captureRect({ x, y, width, height }) }
    },
    // Schermata di una scheda del browser; se la scheda è fuori schermo e il risultato è vuoto la porta in primo piano e riprova.
    async captureBrowser(reference) {
      let target = await toolBridge.getBrowser({ tab: reference, create: false, activate: false })
      const info = target.controller.info()
      const capture = async () => electronAPI.captureWebview(await target.controller.webContentsId())
      let image
      try {
        image = await capture()
      } catch {
        target = await toolBridge.getBrowser({ tab: target.id, create: false, activate: true })
        await sleep(600)
        image = await capture()
      }
      return { number: target.number, shortId: target.shortId, title: info.title || 'senza titolo', url: info.url, image }
    },
    // Prima di una modifica dell'assistente si archivia il testo attuale, così è sempre recuperabile dalla cronologia.
    async snapshot(tab, editor) {
      if (!tab.filePath || !latest.current.project) return
      try {
        await electronAPI.addVersion(tab.filePath, editor.getMarkdown(), 'Prima della modifica AI')
        setHistoryVersion((value) => value + 1)
      } catch (error) {
        console.warn('Versione di sicurezza non salvata', error)
      }
    },
    onNotesChanged: () => setNotesVersion((value) => value + 1),
    }
    return toolBridge
  }, [])

  // Note del documento di contesto: lette dal disco e mostrate come evidenziazioni nell'editor.
  useEffect(() => {
    const path = contextTab?.filePath
    if (!project || !path) { setNotes([]); return undefined }
    let cancelled = false
    electronAPI.listNotes(path).then((list) => { if (!cancelled) setNotes(list) }).catch(() => { if (!cancelled) setNotes([]) })
    return () => { cancelled = true }
  }, [project, contextTab?.filePath, notesVersion])

  useEffect(() => {
    for (const tab of tabs) if (isDocument(tab)) setAnnotations(editors[tab.id], tab.id === contextTab?.id ? notes : [], activeNoteId)
  }, [notes, activeNoteId, editors, tabs, contextTab?.id])

  const selectNote = useCallback((id) => {
    setActiveNoteId(id)
    setSideTab('notes')
  }, [])

  useDocumentFileCommands({ activeTab, getEditor, workspace, onStatusChange: setStatus })

  async function openFromExplorer(filePath) {
    try {
      workspace.openDocument(await electronAPI.openDocumentPath(filePath))
    } catch (error) {
      console.error(error)
      setStatus('Impossibile aprire il file')
    }
  }

  if (!ready || !activeTab) return <div className="h-screen bg-slate-950" />

  // Larghezze dei pannelli laterali: quelle scelte dall'utente, ridotte solo se la finestra è troppo stretta.
  const leftVisible = Boolean(sideTab)
  const rightVisible = assistantOpen
  const widths = fitLayout(layout, { windowWidth, leftVisible, rightVisible })
  const resizeContext = (side) => ({ windowWidth, otherWidth: side === 'left' ? widths.right : widths.left, otherVisible: side === 'left' ? rightVisible : leftVisible })
  // Il riferimento si aggiorna subito (non al prossimo rendering): al rilascio del mouse il salvataggio deve vedere l'ultimo valore.
  const resizePanel = (side) => (value) => {
    const next = { ...layoutRef.current, [side]: clampWidth(side, value, resizeContext(side)) }
    layoutRef.current = next
    setLayout(next)
  }
  const commitLayout = () => saveLayout(layoutRef.current)

  return (
    <ContextMenuContext.Provider value={setContextMenu}>
      <div className="flex h-screen bg-slate-950 text-slate-100">
        <ActivityBar
          activeTab={sideTab}
          onSelect={(id) => setSideTab((current) => (current === id ? null : id))}
          onSettings={() => setScreen('settings')}
        />
        {sideTab && (
          <aside style={{ width: widths.left }} className="relative flex shrink-0 flex-col border-r border-slate-800 bg-slate-900/60">
            <PanelResizer side="left" label="Larghezza del pannello laterale" width={widths.left} min={PANELS.left.min} max={maxWidthFor('left', resizeContext('left'))} defaultWidth={PANELS.left.default} onChange={resizePanel('left')} onCommit={commitLayout} />
            <h2 className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{{ files: 'File', outline: 'Struttura', history: 'Cronologia', notes: 'Note' }[sideTab]}</h2>
            {sideTab === 'files' && (
              <FileExplorer project={project} activePath={contextTab?.sourcePath} refreshToken={explorerRefresh} expandedPaths={expandedPaths} onToggle={toggleExpanded} onChooseProject={chooseProject} onOpenFile={openFromExplorer} onStatus={setStatus} onRenamed={workspace.pathRenamed} onDeleted={workspace.pathDeleted} />
            )}
            {sideTab === 'outline' && <OutlinePanel editor={editors[contextTab?.id]} />}
            {sideTab === 'notes' && (editors[contextTab?.id]
              ? <NotesPanel tab={contextTab} editor={editors[contextTab.id]} project={project} notes={notes} activeNoteId={activeNoteId} onSelectNote={setActiveNoteId} onChanged={() => setNotesVersion((value) => value + 1)} onStatus={setStatus} />
              : <p className="px-3 py-3 text-xs text-slate-500">Nessun documento aperto.</p>)}
            {sideTab === 'history' && (
              <HistoryPanel tab={contextTab} editor={editors[contextTab?.id]} project={project} historyVersion={historyVersion} onChanged={() => setHistoryVersion((value) => value + 1)} onStatus={setStatus} />
            )}
          </aside>
        )}
        <main className="flex min-w-0 flex-1 flex-col">
          <TabBar tabs={tabs} activeId={activeTab.id} onSelect={setActiveId} onClose={workspace.closeTab} onNew={workspace.newTab} onNewBrowser={workspace.openBrowser} assistantOpen={assistantOpen} onToggleAssistant={() => setAssistantOpen((open) => !open)} />
          <section className="flex min-h-0 flex-1 flex-col bg-slate-900">
            {tabs.map((tab) => (tab.kind === 'browser'
              ? <BrowserPane key={tab.id} tab={tab} active={tab.id === activeTab.id} onRegister={registerBrowser} onTitle={workspace.setTitle} />
              : <DocumentPane key={tab.id} tab={tab} active={tab.id === activeTab.id} findRequest={findRequest} onReady={registerEditor} onDirty={workspace.markDirty} onNoteSelect={selectNote} />))}
          </section>
          <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-slate-800 bg-slate-950 px-3 py-1 text-xs text-slate-500">
            <span className="truncate" title={project || ''}>{project ? `Progetto: ${project}` : 'Nessun progetto'}</span>
            <span className="shrink-0">{status}</span>
          </footer>
        </main>
        {/* Sempre montato: chiudere il pannello non interrompe una richiesta in corso. */}
        <aside style={{ width: widths.right }} className={assistantOpen ? 'relative flex min-w-0 shrink-0 flex-col overflow-hidden border-l border-slate-800 bg-slate-900/60' : 'hidden'}>
          {assistantOpen && <PanelResizer side="right" label="Larghezza dell'assistente" width={widths.right} min={PANELS.right.min} max={maxWidthFor('right', resizeContext('right'))} defaultWidth={PANELS.right.default} onChange={resizePanel('right')} onCommit={commitLayout} />}
          <AiChatPanel
            editor={editors[contextTab?.id]}
            contextTab={contextTab}
            toolBridge={toolBridge}
            project={project}
            settingsVersion={settingsVersion}
            conversationId={conversationId}
            onConversationChange={setConversationId}
            onOpenSettings={() => setScreen('settings')}
          />
        </aside>
      </div>
      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={() => setContextMenu(null)} />}
      {screen === 'settings' && <SettingsScreen project={project} onChooseProject={chooseProject} onBack={() => { setScreen('editor'); setSettingsVersion((value) => value + 1) }} />}
    </ContextMenuContext.Provider>
  )
}
