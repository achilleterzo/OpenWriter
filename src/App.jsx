import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ActivityBar from './components/ActivityBar.jsx'
import AiChatPanel from './components/AiChatPanel.jsx'
import DocumentPane from './components/DocumentPane.jsx'
import FileExplorer from './components/FileExplorer.jsx'
import HistoryPanel from './components/HistoryPanel.jsx'
import OutlinePanel from './components/OutlinePanel.jsx'
import SettingsScreen from './components/SettingsScreen.jsx'
import TabBar from './components/TabBar.jsx'
import useDocumentFileCommands from './hooks/useDocumentFileCommands.js'

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
    return { id, filePath: null, sourcePath: null, title: `Senza titolo ${untitledCounter}`, content: '<h2>Inizia a scrivere</h2><p>Questo è il tuo nuovo documento.</p>', contentType: 'html', dirty: false }
  }
  // Solo i Markdown si possono risalvare nello stesso file: DOCX e PDF diventano nuovi documenti.
  const savable = document.format === 'markdown'
  return { id, filePath: savable ? document.filePath : null, sourcePath: document.filePath, title: baseName(document.filePath), content: document.content, contentType: document.contentType, dirty: false }
}

// Ricostruisce le schede dalla sessione salvata: le bozze tornano dal testo salvato, gli altri file dal disco.
async function restoreTabs(session) {
  const tabs = []
  for (const saved of session?.tabs || []) {
    try {
      const number = /^Senza titolo (\d+)$/.exec(saved.title || '')?.[1]
      if (number) untitledCounter = Math.max(untitledCounter, Number(number))
      if (saved.markdown !== undefined) {
        tabs.push({ id: saved.id, filePath: saved.filePath, sourcePath: saved.sourcePath, title: saved.title, content: saved.markdown, contentType: 'markdown', dirty: Boolean(saved.dirty) })
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

  // Gli ultimi valori restano in un ref: serve a salvare la sessione anche dai timer e da beforeunload.
  const latest = useRef({})
  latest.current = { ready, tabs, activeId, editors, project, sideTab, expandedPaths, assistantOpen, conversationId }
  const saveTimer = useRef(null)

  const buildSession = useCallback(() => {
    const { tabs: currentTabs, activeId: currentActive, editors: currentEditors, sideTab: currentSide, expandedPaths: currentExpanded } = latest.current
    return {
      activeId: currentActive,
      sideTab: currentSide,
      expanded: [...currentExpanded],
      assistantOpen: latest.current.assistantOpen,
      conversationId: latest.current.conversationId,
      tabs: currentTabs.map((tab) => {
        const editor = currentEditors[tab.id]
        // Bozze e documenti mai salvati conservano il testo; gli altri si rileggono dal file.
        const keepText = (tab.dirty || !tab.sourcePath) && editor
        return {
          id: tab.id,
          filePath: tab.filePath,
          sourcePath: tab.sourcePath,
          title: tab.title,
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
      const next = remaining.length ? remaining : [createTab()]
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
  const activeTab = tabs.find((tab) => tab.id === activeId) || tabs[0]

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

  return (
    <>
      <div className="flex h-screen bg-slate-950 text-slate-100">
        <ActivityBar
          activeTab={sideTab}
          onSelect={(id) => setSideTab((current) => (current === id ? null : id))}
          onSettings={() => setScreen('settings')}
        />
        {sideTab && (
          <aside className="flex w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-900/60">
            <h2 className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{{ files: 'File', outline: 'Struttura', history: 'Cronologia' }[sideTab]}</h2>
            {sideTab === 'files' && (
              <FileExplorer project={project} activePath={activeTab.sourcePath} refreshToken={explorerRefresh} expandedPaths={expandedPaths} onToggle={toggleExpanded} onChooseProject={chooseProject} onOpenFile={openFromExplorer} onStatus={setStatus} onRenamed={workspace.pathRenamed} onDeleted={workspace.pathDeleted} />
            )}
            {sideTab === 'outline' && <OutlinePanel editor={editors[activeTab.id]} />}
            {sideTab === 'history' && (
              <HistoryPanel tab={activeTab} editor={editors[activeTab.id]} project={project} historyVersion={historyVersion} onChanged={() => setHistoryVersion((value) => value + 1)} onStatus={setStatus} />
            )}
          </aside>
        )}
        <main className="flex min-w-0 flex-1 flex-col">
          <TabBar tabs={tabs} activeId={activeTab.id} onSelect={setActiveId} onClose={workspace.closeTab} onNew={workspace.newTab} assistantOpen={assistantOpen} onToggleAssistant={() => setAssistantOpen((open) => !open)} />
          <section className="flex min-h-0 flex-1 flex-col bg-slate-900">
            {tabs.map((tab) => (
              <DocumentPane key={tab.id} tab={tab} active={tab.id === activeTab.id} onReady={registerEditor} onDirty={workspace.markDirty} />
            ))}
          </section>
          <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-slate-800 bg-slate-950 px-3 py-1 text-xs text-slate-500">
            <span className="truncate" title={project || ''}>{project ? `Progetto: ${project}` : 'Nessun progetto'}</span>
            <span className="shrink-0">{status}</span>
          </footer>
        </main>
        {/* Sempre montato: chiudere il pannello non interrompe una richiesta in corso. */}
        <aside className={assistantOpen ? 'flex w-96 shrink-0 flex-col border-l border-slate-800 bg-slate-900/60' : 'hidden'}>
          <AiChatPanel
            editor={editors[activeTab.id]}
            project={project}
            settingsVersion={settingsVersion}
            conversationId={conversationId}
            onConversationChange={setConversationId}
            onOpenSettings={() => setScreen('settings')}
          />
        </aside>
      </div>
      {screen === 'settings' && <SettingsScreen project={project} onChooseProject={chooseProject} onBack={() => { setScreen('editor'); setSettingsVersion((value) => value + 1) }} />}
    </>
  )
}
