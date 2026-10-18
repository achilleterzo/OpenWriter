import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ActivityBar, { sideTabs } from './components/ActivityBar.jsx'
import AiChatPanel from './components/AiChatPanel.jsx'
import BrowserPane from './components/BrowserPane.jsx'
import ImagePane from './components/ImagePane.jsx'
import { getPreference, setPreference } from './lib/preferences.js'
import { isImageFile } from './lib/imagePaths.js'
import ContextMenu, { ContextMenuContext, modKey } from './components/ContextMenu.jsx'
import DocumentPane from './components/DocumentPane.jsx'
import FileExplorer from './components/FileExplorer.jsx'
import HistoryPanel from './components/HistoryPanel.jsx'
import NotesPanel from './components/NotesPanel.jsx'
import BookmarksPanel from './components/BookmarksPanel.jsx'
import ProjectsPanel from './components/ProjectsPanel.jsx'
import MemoryPanel from './components/MemoryPanel.jsx'
import AboutDialog from './components/AboutDialog.jsx'
import { useDialogs } from './components/Dialogs.jsx'
import { acceptAll, getPending, serializePending } from './lib/pendingChangesExtension.js'
import OutlinePanel from './components/OutlinePanel.jsx'
import PanelResizer from './components/PanelResizer.jsx'
import SettingsScreen from './components/SettingsScreen.jsx'
import TabBar from './components/TabBar.jsx'
import useDocumentFileCommands from './hooks/useDocumentFileCommands.js'
import { setAnnotations } from './lib/annotationExtension.js'
import { setBookmarks } from './lib/bookmarkExtension.js'
import { findFragmentTarget } from './lib/bookmarkLinks.js'
import { foldText, noteIsShown } from './lib/anchoring.js'
import { relativeToProject } from './lib/aiTools.js'
import { handleMcpRequest } from './lib/mcpRequests.js'
import InfoPanel from './components/InfoPanel.jsx'
import { isInsidePath, samePath } from './lib/pathCompare.js'
import { PANELS, clampWidth, fitLayout, loadLayout, maxWidthFor, saveLayout } from './lib/layout.js'
import { AFTER_LANGUAGE_RELOAD_KEY, t } from './i18n/index.js'
import { setProjectEditor, updateAppearance } from './appearance.js'
import { getUpdateSchedule, scheduleOf, subscribeUpdateSchedule } from './lib/updateSchedule.js'

const electronAPI = window.electronAPI
const SAVE_DELAY_MS = 500
const baseName = (filePath) => filePath.split(/[\\/]/).filter(Boolean).at(-1) || filePath

// Riporta un percorso sotto il nuovo nome quando un file o una cartella viene rinominato.
const remapPath = (value, from, to) => {
  if (!value) return value
  if (value === from) return to
  return value.startsWith(`${from}\\`) || value.startsWith(`${from}/`) ? to + value.slice(from.length) : value
}
// Ordine stabile con le schede fissate davanti a tutte le altre.
const keepPinnedFirst = (list) => [...list.filter((tab) => tab.pinned), ...list.filter((tab) => !tab.pinned)]
// Confronto di versioni "1.2.3": positivo se left è più recente di right.
const compareVersions = (left, right) => {
  const parse = (value) => String(value || '').replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0)
  const a = parse(left)
  const b = parse(right)
  for (let index = 0; index < 3; index += 1) { const difference = (a[index] || 0) - (b[index] || 0); if (difference) return difference }
  return 0
}
const isInside = (value, directory) => Boolean(value) && (samePath(value, directory) || isInsidePath(value, directory))

let untitledCounter = 0
function createTab(document = null, id = crypto.randomUUID()) {
  if (!document) {
    untitledCounter += 1
    return { id, filePath: null, sourcePath: null, untitled: untitledCounter, title: t('Untitled {untitledCounter}', { untitledCounter }), content: t('<h2>Start writing</h2><p>This is your new document.</p>'), contentType: 'html', dirty: false }
  }
  // Solo i Markdown si possono risalvare nello stesso file: DOCX e PDF diventano nuovi documenti.
  const savable = document.format === 'markdown'
  return { id, filePath: savable ? document.filePath : null, sourcePath: document.filePath, title: baseName(document.filePath), content: document.content, contentType: document.contentType, dirty: false, ...(document.convertTo ? { convertTo: document.convertTo } : {}), ...(document.readOnly ? { readOnly: true } : {}) }
}

// La scheda del browser non è un documento: non ha editor, file né bozze, e non viene salvata nella sessione.
const createBrowserTab = () => ({ id: crypto.randomUUID(), kind: 'browser', title: t('Browser'), filePath: null, sourcePath: null, dirty: false })
// Le schede del browser e delle immagini non hanno editor né file da salvare: non sono documenti.
const createImageTab = (imagePath) => ({ id: crypto.randomUUID(), kind: 'image', title: baseName(imagePath), imagePath, filePath: null, sourcePath: null, dirty: false })
const isDocument = (tab) => tab && tab.kind !== 'browser' && tab.kind !== 'image'
// Una scheda fissata chiusa resta al suo posto senza documento caricato (con il pulsante "Apri"): non ha editor.
const isLive = (tab) => isDocument(tab) && !tab.closed
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
// Percorso assoluto (Windows, di rete o POSIX): l'assistente lo usa per i documenti aperti fuori dal progetto.
const isAbsolutePath = (value) => /^([A-Za-z]:[\\/]|\\\\|\/)/.test(String(value || ''))

// Ricostruisce le schede dalla sessione salvata: le bozze tornano dal testo salvato, gli altri file dal disco.
async function restoreTabs(session) {
  const tabs = []
  // Con almeno una scheda fissata, alla riapertura restano solo le fissate e le bozze (testo non salvato): le altre si riaprono dal file quando servono.
  const anyPinned = (session?.tabs || []).some((saved) => saved.pinned)
  for (const saved of session?.tabs || []) {
    if (anyPinned && !saved.pinned && saved.markdown === undefined && !saved.pending) continue
    if (saved.closed && saved.pinned && saved.sourcePath) {
      tabs.push({ id: saved.id, filePath: saved.filePath, sourcePath: saved.sourcePath, title: saved.title, content: '', contentType: 'markdown', dirty: false, pinned: true, closed: true })
      continue
    }
    try {
      // Il numero dei documenti senza titolo è un dato salvato, non si ricava dal titolo (che può cambiare con la lingua).
      if (Number.isInteger(saved.untitled)) untitledCounter = Math.max(untitledCounter, saved.untitled)
      if (saved.markdown !== undefined) {
        tabs.push({ id: saved.id, filePath: saved.filePath, sourcePath: saved.sourcePath, untitled: saved.untitled, title: saved.title, content: saved.markdown, contentType: 'markdown', dirty: Boolean(saved.dirty), pinned: Boolean(saved.pinned), ...(saved.aiScore ? { aiScore: saved.aiScore } : {}), ...(saved.pending ? { pending: saved.pending } : {}) })
      } else if (saved.sourcePath) {
        tabs.push({ ...createTab({ ...(await electronAPI.reopenDocument(saved.sourcePath)), ...(saved.readOnly ? { readOnly: true } : {}) }, saved.id), pinned: Boolean(saved.pinned), ...(saved.aiScore ? { aiScore: saved.aiScore } : {}), ...(saved.pending ? { pending: saved.pending } : {}) })
      }
    } catch (error) {
      console.warn('Scheda non ripristinata', saved?.title, error)
    }
  }
  const result = tabs.length ? tabs : [createTab()]
  // Le schede del browser tornano dove stavano, alla pagina in cui erano.
  for (const saved of [...(Array.isArray(session?.browser) ? session.browser : [])].sort((left, right) => left.index - right.index)) {
    if (typeof saved?.id !== 'string') continue
    const url = /^https?:\/\//i.test(saved.url) ? saved.url : ''
    result.splice(Math.min(Math.max(Number(saved.index) || 0, 0), result.length), 0, { ...createBrowserTab(), id: saved.id, title: String(saved.title || t('Browser')), initialUrl: url })
  }
  return result
}

export default function App() {
  const [ready, setReady] = useState(false)
  const [tabs, setTabs] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [editors, setEditors] = useState({})
  const [project, setProject] = useState(null)
  // Progetto "main" (nei dati dell'app): area di lavoro dell'assistente quando nessun progetto è aperto.
  const [mainProject, setMainProject] = useState(null)
  const workspaceRoot = project || mainProject
  const [sideTab, setSideTab] = useState('files')
  const [expandedPaths, setExpandedPaths] = useState(() => new Set())
  const [explorerRefresh, setExplorerRefresh] = useState(0)
  // Cambia quando le modifiche dell'assistente da rivedere vengono accettate o rifiutate: serve a ridisegnare il pulsante "Salva tutto".
  const [, setPendingTick] = useState(0)
  const [memoryVersion, setMemoryVersion] = useState(0)
  const [historyVersion, setHistoryVersion] = useState(0)
  const [status, setStatus] = useState('')
  const [screen, setScreen] = useState(() => {
    try {
      if (sessionStorage.getItem(AFTER_LANGUAGE_RELOAD_KEY)) { sessionStorage.removeItem(AFTER_LANGUAGE_RELOAD_KEY); return 'settings' }
    } catch { /* sessionStorage non disponibile */ }
    return 'editor'
  })
  // Scheda con cui si aprono le impostazioni: Generale, salvo dall'ingranaggio dell'assistente (IA).
  const [settingsSection, setSettingsSection] = useState('general')
  // Note mostrate: 'open' (predefinito) | 'all' | 'mine' (scritte dall'utente) | 'none' (nascoste). Vale per l'elenco e per le evidenziazioni nel testo.
  const [noteView, setNoteViewState] = useState(() => { const saved = getPreference('openwriter.noteView'); return ['open', 'all', 'mine', 'none'].includes(saved) ? saved : 'open' })
  const setNoteView = (value) => { setNoteViewState(value); setPreference('openwriter.noteView', value) }
  const [noteSearch, setNoteSearch] = useState('')
  const [aboutOpen, setAboutOpen] = useState(false)
  const [aboutCheck, setAboutCheck] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [updateRelease, setUpdateRelease] = useState(null)
  const [updateNoticeVisible, setUpdateNoticeVisible] = useState(false)
  const openSettings = (section = 'general') => { setSettingsSection(section); setScreen('settings') }
  const [assistantOpen, setAssistantOpen] = useState(false)
  // Documenti nel contesto della chat: il documento attivo (di default sì) e gli altri aperti, "pinnati" per id di scheda.
  const [contextPins, setContextPins] = useState({ includeActive: true, pinnedIds: [] })
  const [chatRequest, setChatRequest] = useState(null)
  const [conversationId, setConversationId] = useState(null)
  const [settingsVersion, setSettingsVersion] = useState(0)
  const [notes, setNotes] = useState([])
  const [notesVersion, setNotesVersion] = useState(0)
  // Segnalibri del documento di contesto (ancore con nome: link `file#nome`, punti da far notare all'assistente).
  const [bookmarks, setBookmarksState] = useState([])
  const [bookmarksVersion, setBookmarksVersion] = useState(0)
  const [activeBookmarkId, setActiveBookmarkId] = useState(null)
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
  if (isLive(activeTab)) lastDocumentId.current = activeTab.id
  // Il documento "di contesto" è quello attivo, oppure l'ultimo usato quando in primo piano c'è il browser.
  const contextTab = isLive(activeTab) ? activeTab : tabs.find((tab) => tab.id === lastDocumentId.current && isLive(tab)) || tabs.find(isLive) || tabs.find(isDocument)

  // Gli ultimi valori restano in un ref: serve a salvare la sessione anche dai timer e da beforeunload.
  const latest = useRef({})
  latest.current = { ready, tabs, activeId, editors, project, sideTab, expandedPaths, assistantOpen, conversationId, contextPins, contextTabId: contextTab?.id }
  const saveTimer = useRef(null)

  const buildSession = useCallback(() => {
    const { tabs: currentTabs, activeId: currentActive, editors: currentEditors, sideTab: currentSide, expandedPaths: currentExpanded } = latest.current
    return {
      activeId: currentTabs.some((tab) => tab.id === currentActive && isDocument(tab)) ? currentActive : latest.current.contextTabId,
      sideTab: currentSide,
      expanded: [...currentExpanded],
      assistantOpen: latest.current.assistantOpen,
      conversationId: latest.current.conversationId,
      chatContext: { includeActive: latest.current.contextPins.includeActive, pinnedIds: latest.current.contextPins.pinnedIds.filter((id) => currentTabs.some((tab) => tab.id === id)) },
      // Schede del browser: indirizzo attuale e posizione tra le schede. Si riaprono alla pagina dov'erano (non la cronologia di navigazione).
      browser: currentTabs.map((tab, index) => ({ tab, index })).filter(({ tab }) => tab.kind === 'browser').map(({ tab, index }) => ({ id: tab.id, title: tab.title, url: browserControllers.current.get(tab.id)?.info().url || tab.initialUrl || '', index })),
      activeBrowserId: currentTabs.some((tab) => tab.id === currentActive && tab.kind === 'browser') ? currentActive : null,
      tabs: currentTabs.filter(isDocument).map((tab) => {
        const editor = currentEditors[tab.id]
        // Bozze e documenti mai salvati conservano il testo; gli altri si rileggono dal file.
        // Se l'editor non è ancora pronto (appena riaperta la sessione) il testo non salvato si tiene com'è: altrimenti un salvataggio troppo presto lo perderebbe.
        const unsavedText = editor ? editor.getMarkdown() : (tab.contentType === 'markdown' && typeof tab.content === 'string' && tab.content ? tab.content : undefined)
        const keepText = (tab.dirty || !tab.sourcePath) && unsavedText !== undefined
        // Modifiche dell'assistente ancora da rivedere (o non ancora rimesse in sosta dopo la riapertura): restano nella sessione.
        const pending = (editor && serializePending(editor)) || tab.pending
        return {
          id: tab.id,
          filePath: tab.filePath,
          sourcePath: tab.sourcePath,
          title: tab.title,
          untitled: tab.untitled,
          dirty: tab.dirty,
          pinned: Boolean(tab.pinned),
          ...(tab.aiScore ? { aiScore: tab.aiScore } : {}),
          ...(pending ? { pending } : {}),
          closed: Boolean(tab.closed),
          ...(tab.readOnly ? { readOnly: true } : {}),
          ...(keepText ? { markdown: unsavedText } : {}),
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
    setActiveId(restored.some((tab) => tab.id === session?.activeBrowserId) ? session.activeBrowserId : restored.some((tab) => tab.id === session?.activeId) ? session.activeId : restored.find(isDocument)?.id ?? restored[0].id)
    setSideTab(session && 'sideTab' in session ? session.sideTab : 'files')
    setExpandedPaths(new Set(session?.expanded || []))
    setAssistantOpen(Boolean(session?.assistantOpen))
    setContextPins({ includeActive: session?.chatContext?.includeActive !== false, pinnedIds: (session?.chatContext?.pinnedIds || []).filter((id) => restored.some((tab) => tab.id === id)) })
    // Le conversazioni ora stanno in .ow/chat: quella salvata nella sessione dalle versioni precedenti viene importata una volta.
    let activeConversation = session?.conversationId ?? null
    if (Array.isArray(session?.chat) && session.chat.length && (await electronAPI.getProject())) {
      try {
        const imported = await electronAPI.createConversation({ title: t('Imported conversation'), messages: session.chat })
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
      const initial = await electronAPI.getProject()
      setProject(initial)
      setMainProject(await electronAPI.getMainProject())
      await applySession(await electronAPI.loadSession())
      // Senza progetto si parte dalla home dei progetti.
      if (!initial) setSideTab('projects')
      setReady(true)
    })()
  }, [applySession])

  // Qualsiasi cambio di stato persistente salva la sessione; le digitazioni passano da markDirty.
  useEffect(() => {
    if (ready) scheduleSave()
  }, [ready, tabs, activeId, sideTab, expandedPaths, assistantOpen, conversationId, contextPins, scheduleSave])

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
        if (!info.suggestions.length) items.push({ label: t('No suggestions'), disabled: true })
        items.push({ label: t('Add "{misspelledWord}" to dictionary', { misspelledWord: info.misspelledWord }), onClick: () => electronAPI.addToDictionary(info.misspelledWord) }, { separator: true })
      }
      if (info.isEditable) items.push({ label: t('Cut'), hint: `${modKey}X`, disabled: !info.flags.canCut, onClick: () => electronAPI.editAction('cut') })
      items.push({ label: t('Copy'), hint: `${modKey}C`, disabled: !info.flags.canCopy, onClick: () => electronAPI.editAction('copy') })
      if (info.isEditable) {
        items.push({ label: t('Paste'), hint: `${modKey}V`, disabled: !info.flags.canPaste, onClick: () => electronAPI.editAction('paste') }, { separator: true }, { label: t('Select all'), hint: `${modKey}A`, onClick: () => electronAPI.editAction('selectAll') })
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

  // Cambio progetto: la sessione del progetto corrente viene salvata prima, poi si carica quella del nuovo.
  // `adopt` (facoltativo): lavoro da fare nel nuovo progetto prima di mostrarlo (es. aprire documenti e riprendere una conversazione).
  const switchProject = useCallback(async (pick, adopt) => {
    flushSession()
    const chosen = await pick()
    if (!chosen || chosen === latest.current.project) return chosen
    setReady(false)
    setProject(chosen)
    await applySession(await electronAPI.loadSession())
    await adopt?.(chosen)
    setReady(true)
    return chosen
  }, [flushSession, applySession])

  // L'assistente ha creato un progetto: la conversazione lo segue (copiata nella sua chat), i documenti collegati si aprono nelle schede
  // (sono gli originali, non copie) e l'assistente riprende da dove era, ora con gli strumenti sui file.
  const moveToCreatedProject = useCallback(async ({ path: target, links, conversationId: movedId }) => {
    await electronAPI.copyConversationToProject({ id: movedId, target })
    await switchProject(() => electronAPI.openProject(target), async () => {
      const opened = []
      for (const file of links) {
        try { opened.push(createTab(await electronAPI.openDocumentPath(file))) } catch (error) { console.warn('Documento collegato non aperto', file, error) }
      }
      if (opened.length) {
        setTabs(opened)
        setActiveId(opened[0].id)
      }
      setConversationId(movedId)
      setAssistantOpen(true)
      setChatRequest({ id: Date.now(), resume: true, conversationId: movedId })
    })
  }, [switchProject])
  const moveToCreatedProjectRef = useRef(null)
  moveToCreatedProjectRef.current = moveToCreatedProject

  // Sposta un progetto in un'altra cartella (l'utente sceglie dove). Se è quello aperto, resta aperto nel nuovo posto: la sessione
  // si salva prima (con i vecchi percorsi), il processo principale la riscrive con i nuovi, e qui si ricarica.
  const moveProject = useCallback(async (directory) => {
    flushSession()
    const moved = await electronAPI.moveProject(directory)
    if (!moved) return null
    if (moved.wasOpen) {
      setReady(false)
      setProject(moved.path)
      await applySession(await electronAPI.loadSession())
      setReady(true)
    }
    return moved.path
  }, [flushSession, applySession])

  const chooseProject = useCallback(() => switchProject(() => electronAPI.chooseProject()), [switchProject])
  const openProject = useCallback((directory) => switchProject(() => electronAPI.openProject(directory)), [switchProject])
  const createProject = useCallback((name) => switchProject(() => electronAPI.createProject(name)), [switchProject])

  // Nuova versione: controllo all'avvio (e a richiesta dalla finestra Informazioni), confronto con la versione in uso.
  const checkForUpdate = useCallback(async (silent = false) => {
    const version = await electronAPI.getAppVersion()
    setAppVersion(version)
    const release = await electronAPI.getLatestRelease(silent)
    const newer = release?.version && compareVersions(release.version, version) > 0
    // Una release già segnalata resta lo stesso oggetto: i controlli periodici non rimostrano l'avviso ogni volta.
    setUpdateRelease((previous) => (newer ? (previous?.version === release.version ? previous : release) : null))
    return Boolean(newer)
  }, [])

  // Controllo automatico secondo l'impostazione (Impostazioni → Informazioni): mai, all'avvio, o all'avvio e poi a intervalli.
  const [updateSchedule, setUpdateScheduleState] = useState(getUpdateSchedule)
  useEffect(() => subscribeUpdateSchedule(setUpdateScheduleState), [])
  useEffect(() => {
    if (!electronAPI) return undefined
    electronAPI.getAppVersion().then(setAppVersion).catch(() => {})
    if (updateSchedule === 'never') return undefined
    checkForUpdate(true).catch(() => {})
    const { interval } = scheduleOf(updateSchedule)
    if (!interval) return undefined
    const timer = setInterval(() => { checkForUpdate(true).catch(() => {}) }, interval)
    return () => clearInterval(timer)
  }, [checkForUpdate, updateSchedule])

  useEffect(() => {
    if (!updateRelease) return undefined
    setUpdateNoticeVisible(true)
    const timer = setTimeout(() => setUpdateNoticeVisible(false), 9000)
    return () => clearTimeout(timer)
  }, [updateRelease])

  useEffect(() => {
    if (!electronAPI) return undefined
    return electronAPI.onAppCommand((command) => {
      if (command === 'about' || command === 'check-updates') { setAboutCheck(command === 'check-updates'); setAboutOpen(true) }
      if (command === 'settings') openSettings()
      if (command === 'open-project') chooseProject()
      if (command === 'view-endless' || command === 'view-pages') updateAppearance({ view: command.slice(5) })
    })
  }, [chooseProject])

  // L'albero dei file si aggiorna quando la cartella del progetto cambia per mano di altri programmi (file incollati, creati, spostati, eliminati).
  useEffect(() => {
    if (!electronAPI || !project) return undefined
    electronAPI.watchWorkspace().catch(() => {})
    return electronAPI.onWorkspaceChanged(() => setExplorerRefresh((value) => value + 1))
  }, [project])

  // Note e segnalibri scritti da fuori (l'agente, tramite il server MCP) compaiono subito, senza riaprire il documento.
  useEffect(() => {
    if (!electronAPI?.onAnnotationsChanged || !project) return undefined
    return electronAPI.onAnnotationsChanged(() => { setNotesVersion((value) => value + 1); setBookmarksVersion((value) => value + 1) })
  }, [project])

  // Carattere dell'editor specifico del progetto aperto, se le sue impostazioni ne indicano uno.
  useEffect(() => {
    if (!electronAPI) return
    electronAPI.getProjectSettings().then((settings) => setProjectEditor(settings.available ? settings.editor : null)).catch(() => setProjectEditor(null))
  }, [project])

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

  const dialogs = useDialogs()
  const dialogsRef = useRef(dialogs)
  dialogsRef.current = dialogs

  const workspace = useMemo(() => ({
    newTab() {
      const tab = createTab()
      setTabs((current) => [...current, tab])
      setActiveId(tab.id)
    },
    // `preview`: aperto con un clic dall'elenco dei file, come anteprima: il prossimo file aperto così prende il suo posto, finché non ci si lavora
    // (modifica, scorrimento, clic nel testo, doppio clic, fissare la scheda). `permanent`: se è già un'anteprima, la rende una scheda a tutti gli effetti.
    openDocument(document, { preview = false, permanent = false } = {}) {
      const existing = latest.current.tabs.find((tab) => tab.sourcePath === document.filePath)
      if (existing?.closed) {
        // Scheda fissata chiusa: si ricarica il documento al suo posto.
        setTabs((current) => current.map((tab) => (tab.id === existing.id ? { ...createTab(document, existing.id), pinned: true } : tab)))
        setActiveId(existing.id)
        return
      }
      if (existing) {
        if (permanent && existing.preview) setTabs((current) => current.map((tab) => (tab.id === existing.id ? { ...tab, preview: false } : tab)))
        setActiveId(existing.id)
        return
      }
      const tab = { ...createTab(document), ...(preview && !permanent ? { preview: true } : {}) }
      setTabs((current) => {
        if (tab.preview) {
          // L'anteprima precedente (mai toccata, non fissata) si chiude: la nuova prende il suo posto.
          const index = current.findIndex((item) => item.kind !== 'browser' && item.preview && !item.dirty && !item.pinned && !item.closed)
          if (index !== -1) return current.map((item, position) => (position === index ? tab : item))
        }
        return [...current, tab]
      })
      setActiveId(tab.id)
      setStatus(t('Opened'))
    },
    // Pulsante "Apri" di una scheda fissata chiusa: rilegge il documento dal file.
    async reopenTab(id) {
      const tab = latest.current.tabs.find((item) => item.id === id)
      if (!tab?.closed) return
      try {
        const document = await electronAPI.reopenDocument(tab.sourcePath)
        setTabs((current) => current.map((item) => (item.id === id ? { ...createTab(document, id), pinned: true } : item)))
        setActiveId(id)
      } catch (error) {
        console.error(error)
        setStatus(t('Could not open the file'))
      }
    },
    // Salva una scheda: se ha già un file lo sovrascrive, altrimenti (o con "salva con nome") chiede dove. Restituisce true se salvata.
    async saveTab(id, { saveAs = false } = {}) {
      const { tabs: currentTabs, editors: currentEditors } = latest.current
      const tab = currentTabs.find((item) => item.id === id)
      const editor = currentEditors[id]
      if (!tab || !editor) return false
      try {
        const savedPath = await electronAPI.saveMarkdown({ filePath: tab.filePath, markdown: editor.getMarkdown(), saveAs })
        if (!savedPath) return false
        workspaceRef.current.markSaved(id, savedPath)
        return true
      } catch (error) {
        console.error(error)
        setStatus(t('The operation failed'))
        return false
      }
    },
    async closeTab(id) {
      const tab = latest.current.tabs.find((item) => item.id === id)
      if (!tab) return
      // Con modifiche non salvate si propone di salvare prima di chiudere (annullando il salvataggio la scheda resta aperta).
      if (tab.dirty) {
        const choice = await dialogsRef.current.choose(t('Save the changes to “{title}” before closing?', { title: tab.title }), [
          { value: 'save', label: t('Save'), primary: true },
          { value: 'discard', label: t('Don\'t save'), danger: true },
          { value: 'cancel', label: t('Cancel') },
        ])
        if (!choice || choice === 'cancel') return
        if (choice === 'save' && !(await workspaceRef.current.saveTab(id))) return
      }
      // Una scheda fissata con un file non sparisce: resta al suo posto senza documento, con il pulsante "Apri".
      if (tab.pinned && tab.sourcePath && !tab.closed) {
        setTabs((list) => list.map((item) => (item.id === id ? { ...item, closed: true, dirty: false, content: '' } : item)))
        return
      }
      const current = latest.current.tabs
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
        if (tab.kind === 'image') {
          const imagePath = remapPath(tab.imagePath, from, to)
          return imagePath === tab.imagePath ? tab : { ...tab, imagePath, title: baseName(imagePath) }
        }
        const sourcePath = remapPath(tab.sourcePath, from, to)
        const filePath = remapPath(tab.filePath, from, to)
        if (sourcePath === tab.sourcePath && filePath === tab.filePath) return tab
        const title = tab.sourcePath && tab.title === baseName(tab.sourcePath) ? baseName(sourcePath) : tab.title
        return { ...tab, sourcePath, filePath, title }
      }))
      setExpandedPaths((current) => new Set([...current].map((item) => remapPath(item, from, to))))
      setHistoryVersion((value) => value + 1)
      setStatus(t('Renamed'))
    },
    // Le schede di un file eliminato che avevano modifiche (o modifiche dell'assistente da rivedere) restano aperte come documenti non salvati, così il testo non va perso;
    // quelle senza nulla da salvare, e le immagini, si chiudono: non c'è nulla da conservare.
    pathDeleted(target) {
      const { editors: currentEditors } = latest.current
      const inside = (tab) => isInside(tab.sourcePath, target) || isInside(tab.filePath, target)
      const hasWork = (tab) => tab.dirty || Boolean(currentEditors[tab.id] && !currentEditors[tab.id].isDestroyed && getPending(currentEditors[tab.id].state).length)
      setTabs((current) => {
        const remaining = current
          .filter((tab) => !(tab.kind === 'image' && isInside(tab.imagePath, target)))
          .filter((tab) => !(isDocument(tab) && inside(tab) && !hasWork(tab)))
          .map((tab) => (isDocument(tab) && inside(tab) ? { ...tab, sourcePath: null, filePath: null, dirty: true, closed: false } : tab))
        return remaining.some(isDocument) ? remaining : [...remaining, createTab()]
      })
      setExpandedPaths((current) => new Set([...current].filter((item) => !isInside(item, target))))
      setHistoryVersion((value) => value + 1)
      setStatus(t('Moved to the trash'))
    },
    // Fissa o stacca una scheda; le fissate stanno sempre a sinistra.
    togglePin(id) {
      // Staccare una scheda fissata già chiusa la elimina (non ha documento da tenere aperto).
      if (latest.current.tabs.find((tab) => tab.id === id)?.closed) { setTabs((current) => current.filter((tab) => tab.id !== id)); return }
      setTabs((current) => keepPinnedFirst(current.map((tab) => (tab.id === id ? { ...tab, pinned: !tab.pinned, preview: false } : tab))))
    },
    // Trascinamento: la scheda `id` passa davanti a `beforeId` (restando nel proprio gruppo, fissate o no).
    moveTab(id, beforeId) {
      if (id === beforeId) return
      setTabs((current) => {
        const moving = current.find((tab) => tab.id === id)
        if (!moving) return current
        const rest = current.filter((tab) => tab.id !== id)
        const position = rest.findIndex((tab) => tab.id === beforeId)
        if (position === -1) return current
        return keepPinnedFirst([...rest.slice(0, position), moving, ...rest.slice(position)])
      })
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
    // Il testo è tornato uguale a quello salvato (per esempio dopo "Annulla"): la scheda non è più modificata.
    markClean(id) {
      setTabs((current) => (current.some((tab) => tab.id === id && tab.dirty) ? current.map((tab) => (tab.id === id ? { ...tab, dirty: false } : tab)) : current))
      scheduleSave()
    },
    // L'utente (o l'assistente) ha lavorato sul documento: l'anteprima diventa una scheda a tutti gli effetti.
    // Controllo "quanto sembra scritto da un'AI": si chiede all'assistente, che registra il punteggio con lo strumento set_ai_score.
    requestAiCheck(id) {
      setActiveId(id)
      setAssistantOpen(true)
      setChatRequest({ id: Date.now(), text: t('Check how likely this document is to have been written by an AI rather than by a person, and record the result with the set_ai_score tool. Read the whole text first. Judge only from its style and structure, and be cautious: it is only an indication.') })
    },
    // Nella scheda di un'immagine si passa a un'altra immagine (frecce, pulsanti ai lati): la scheda resta la stessa.
    changeImage(id, imagePath) {
      setTabs((current) => current.map((tab) => (tab.id === id && tab.kind === 'image' ? { ...tab, imagePath, title: baseName(imagePath) } : tab)))
    },
    // Apre un'immagine del progetto in una scheda di visualizzazione (sola lettura); `preview` e `permanent` come per i documenti.
    openImage(imagePath, { preview = false, permanent = false } = {}) {
      const existing = latest.current.tabs.find((tab) => tab.kind === 'image' && samePath(tab.imagePath, imagePath))
      if (existing) {
        if (permanent && existing.preview) setTabs((current) => current.map((tab) => (tab.id === existing.id ? { ...tab, preview: false } : tab)))
        setActiveId(existing.id)
        return
      }
      const tab = { ...createImageTab(imagePath), ...(preview && !permanent ? { preview: true } : {}) }
      setTabs((current) => {
        if (tab.preview) {
          const index = current.findIndex((item) => item.kind !== 'browser' && item.preview && !item.dirty && !item.pinned && !item.closed)
          if (index !== -1) return current.map((item, position) => (position === index ? tab : item))
        }
        return [...current, tab]
      })
      setActiveId(tab.id)
    },
    // I dati delle modifiche in sosta salvati nella sessione sono stati rimessi nell'editor: da qui in poi vale lo stato dell'editor.
    clearPendingData(id) {
      setTabs((current) => (current.some((tab) => tab.id === id && tab.pending) ? current.map((tab) => { if (tab.id !== id) return tab; const { pending, ...rest } = tab; return rest }) : current))
    },
    // Una modifica è stata accettata o rifiutata: si aggiorna la sessione.
    pendingChanged() { setPendingTick((value) => value + 1); scheduleSave() },
    promoteTab(id) {
      setTabs((current) => (current.some((tab) => tab.id === id && tab.preview) ? current.map((tab) => (tab.id === id ? { ...tab, preview: false } : tab)) : current))
    },
    markDirty(id) {
      setTabs((current) => (current.some((tab) => tab.id === id && !tab.dirty) ? current.map((tab) => (tab.id === id ? { ...tab, dirty: true, preview: false, ...(tab.aiScore ? { aiScore: { ...tab.aiScore, stale: true } } : {}) } : tab)) : current))
      scheduleSave()
    },
    markSaved(id, filePath) {
      setTabs((current) => current.map((tab) => (tab.id === id ? { ...tab, filePath, sourcePath: filePath, title: baseName(filePath), dirty: false, convertTo: undefined } : tab)))
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
      const documents = currentTabs.filter(isLive)
      const given = relativePath ? String(relativePath).replace(/\\/g, '/') : null
      const wanted = given ? (isAbsolutePath(given) ? given : `${currentProject}/${given}`) : null
      const tab = wanted
        ? documents.find((item) => samePath(item.filePath, wanted) || samePath(item.sourcePath, wanted))
        : documents.find((item) => item.id === contextTabId)
      if (!tab) throw new Error(wanted ? t('The document "{relativePath}" is not open in a tab: ask the user to open it', { relativePath }) : t('No document open'))
      if (!currentEditors[tab.id]) throw new Error(t('The document editor is not ready yet'))
      return { tab, editor: currentEditors[tab.id] }
    },
    // Testo attuale dell'editor per un file del progetto aperto in una scheda (anche con modifiche non salvate).
    getOpenDocumentText(relativePath) {
      const { tabs: currentTabs, editors: currentEditors, project: currentProject } = latest.current
      const given = String(relativePath).replace(/\\/g, '/')
      if (!currentProject && !isAbsolutePath(given)) return null
      const wanted = isAbsolutePath(given) ? given : `${currentProject}/${given}`
      const tab = currentTabs.filter(isLive).find((item) => samePath(item.filePath, wanted) || samePath(item.sourcePath, wanted))
      const editor = tab && currentEditors[tab.id]
      return editor ? { text: editor.getMarkdown(), dirty: tab.dirty } : null
    },
    // Imagine che l'utente ha aperta nella scheda attiva (percorso relativo al progetto), se la scheda attiva è un'immagine.
    activeImagePath() {
      const { tabs: currentTabs, project: currentProject, activeId: currentActive } = latest.current
      const tab = currentTabs.find((item) => item.id === currentActive && item.kind === 'image')
      return tab ? relativeToProject(currentProject, tab.imagePath) : null
    },
    activeDocumentPath() {
      const { tabs: currentTabs, project: currentProject, contextTabId } = latest.current
      const tab = currentTabs.find((item) => item.id === contextTabId)
      return tab?.filePath ? relativeToProject(currentProject, tab.filePath) || tab.filePath.replace(/\\/g, '/') : null
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
        if (!target) throw new Error(t('Browser tab "{reference}" not found: use browser_tabs to see the open ones', { reference }))
      } else if (!newTab) {
        target = list.find((item) => item.id === latest.current.activeId) || list.find((item) => item.id === lastBrowserId.current) || list[0] || null
      }
      let number = target ? list.indexOf(target) + 1 : 0
      if (!target) {
        if (!create && !newTab) throw new Error(t('No browser tab is open: the user can open one (globe icon) or you can with web_open or web_search, if web browsing is enabled'))
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
      throw new Error(t('The browser is not ready'))
    },
    // Schermata della parte visibile del documento (se non è in primo piano lo porta davanti e attende il ridisegno).
    async captureDocument(relativePath) {
      const { tab } = toolBridge.getDocument(relativePath)
      if (latest.current.activeId !== tab.id) {
        setActiveId(tab.id)
        await sleep(500)
      }
      const element = document.querySelector(`[data-document-scroll="${tab.id}"]`)
      if (!element) throw new Error(t('The document is not visible'))
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
      return { number: target.number, shortId: target.shortId, title: info.title || t('untitled'), url: info.url, image }
    },
    // Crea un progetto per l'assistente: l'utente conferma e sceglie la cartella (nel processo principale); i documenti indicati vi vengono collegati, non copiati.
    async createProject({ name, documents }) {
      const paths = []
      for (const given of documents) {
        const { tab } = toolBridge.getDocument(given)
        if (!tab.filePath) throw new Error(t('The document "{relativePath}" is not saved on disk: ask the user to save it before linking it', { relativePath: given }))
        // Il collegamento punta al file: le modifiche ancora non salvate vanno prima su disco.
        if (tab.dirty && !(await workspaceRef.current.saveTab(tab.id))) throw new Error(t('The document "{relativePath}" could not be saved', { relativePath: given }))
        paths.push(tab.filePath)
      }
      return electronAPI.createProjectForAi({ name, documents: paths })
    },
    moveToCreatedProject: (info) => moveToCreatedProjectRef.current(info),
    // Punteggio registrato dall'assistente per un documento: si mostra nella barra del documento; si segna "da rifare" se il testo cambia.
    setAiScore(tab, data) {
      setTabs((current) => current.map((item) => (item.id === tab.id ? { ...item, aiScore: { ...data, at: new Date().toISOString(), stale: false } } : item)))
    },
    // Prima di una modifica dell'assistente si archivia il testo attuale, così è sempre recuperabile dalla cronologia.
    async snapshot(tab, editor) {
      if (!tab.filePath) return
      try {
        await electronAPI.addVersion(tab.filePath, editor.getMarkdown(), t('Before the AI edit'))
        setHistoryVersion((value) => value + 1)
      } catch (error) {
        console.warn('Versione di sicurezza non salvata', error)
      }
    },
    // Quando l'assistente aggiunge o rivede note, si apre la scheda Note per mostrarle.
    onNotesChanged: () => { setNotesVersion((value) => value + 1); setSideTab('notes') },
    onBookmarksChanged: () => { setBookmarksVersion((value) => value + 1); setSideTab('bookmarks') },
    // Testo attuale (Markdown) di un documento aperto, per il contesto della chat; null se l'editor non è pronto.
    documentFilePath(id) {
      return latest.current.tabs.find((tab) => tab.id === id)?.filePath || null
    },
    documentMarkdown(id) {
      const editor = latest.current.editors[id]
      return editor ? editor.getMarkdown() : null
    },
    // Salva un documento già associato a un file Markdown (usato a fine lavoro dell'assistente); gli altri restano modificati.
    // Le modifiche dell'assistente ancora da rivedere non si scrivono nel file: salvarle equivarrebbe ad accettarle al posto dell'utente.
    // Il documento resta modificato finché l'utente le accetta o le rifiuta e salva (`force`: solo per non perdere il lavoro, quando le schede stanno per essere sostituite).
    async saveDocument(id, { force = false } = {}) {
      const { tabs: currentTabs, editors: currentEditors } = latest.current
      const tab = currentTabs.find((item) => item.id === id)
      const editor = currentEditors[id]
      if (!tab?.filePath || !editor) return false
      if (!force && getPending(editor.state).length) return false
      const savedPath = await electronAPI.saveMarkdown({ filePath: tab.filePath, markdown: editor.getMarkdown(), saveAs: false })
      if (!savedPath) return false
      workspaceRef.current.markSaved(id, savedPath)
      setStatus(t('Saved'))
      return true
    },
    // Richiude un documento aperto dall'assistente, ma solo se non ha modifiche non salvate.
    async closeDocument(id) {
      await sleep(150)
      const tab = latest.current.tabs.find((item) => item.id === id)
      if (!tab || tab.dirty) return false
      workspaceRef.current.closeTab(id)
      return true
    },
    onFilesChanged: () => setExplorerRefresh((value) => value + 1),
    onMemoryChanged: () => setMemoryVersion((value) => value + 1),
    // Un file è stato cestinato o spostato dall'assistente: le schede e l'esplora file si aggiornano come per il file manager.
    onPathChanged({ deleted, from, to }) {
      if (deleted) workspaceRef.current.pathDeleted(deleted)
      else workspaceRef.current.pathRenamed(from, to)
      setExplorerRefresh((value) => value + 1)
    },
    openFile: (absolutePath) => openFileRef.current?.(absolutePath),
    }
    return toolBridge
  }, [])

  // Un agente esterno (server MCP) chiede di modificare un documento: si esegue sull'editor, con le modifiche "da rivedere" (accetta/rifiuta).
  useEffect(() => {
    if (!electronAPI?.onMcpRequest) return undefined
    return electronAPI.onMcpRequest(async ({ id, tool, args }) => {
      try {
        const text = await handleMcpRequest({ tool, args }, {
          api: electronAPI,
          toolBridge,
          project: latest.current.project,
          activate: setActiveId,
          notify: (title) => setStatus(t('An agent proposed changes to “{title}”: review them in the document', { title })),
          refreshNotes: () => setNotesVersion((value) => value + 1),
        })
        electronAPI.answerMcp(id, { ok: true, text })
      } catch (error) {
        electronAPI.answerMcp(id, { ok: false, error: error.message || String(error) })
      }
    })
  }, [toolBridge])

  // Note del documento di contesto: lette dal disco e mostrate come evidenziazioni nell'editor.
  useEffect(() => {
    const path = contextTab?.filePath
    if (!workspaceRoot || !path) { setNotes([]); return undefined }
    let cancelled = false
    electronAPI.listNotes(path).then((list) => { if (!cancelled) setNotes(list) }).catch(() => { if (!cancelled) setNotes([]) })
    return () => { cancelled = true }
  }, [workspaceRoot, contextTab?.filePath, notesVersion])

  // Segnalibri del documento di contesto: letti dal disco e mostrati nell'editor (segno e sottolineatura).
  useEffect(() => {
    const path = contextTab?.filePath
    if (!workspaceRoot || !path) { setBookmarksState([]); return undefined }
    let cancelled = false
    electronAPI.listBookmarks(path).then((list) => { if (!cancelled) setBookmarksState(list) }).catch(() => { if (!cancelled) setBookmarksState([]) })
    return () => { cancelled = true }
  }, [workspaceRoot, contextTab?.filePath, bookmarksVersion])

  useEffect(() => {
    for (const tab of tabs) if (isDocument(tab)) setBookmarks(editors[tab.id], tab.id === contextTab?.id ? bookmarks : [], activeBookmarkId)
  }, [bookmarks, activeBookmarkId, editors, tabs, contextTab?.id])

  // Una nota che si chiude (risolta, accettata o rifiutata, anche dall'assistente) smette di essere "selezionata":
  // altrimenti resterebbe in elenco e nel testo anche con la vista "Aperte".
  const noteStatuses = useRef(new Map())
  useEffect(() => {
    const previous = noteStatuses.current
    const next = new Map(notes.map((note) => [note.id, note.status]))
    if (activeNoteId && previous.get(activeNoteId) === 'open' && next.get(activeNoteId) && next.get(activeNoteId) !== 'open') setActiveNoteId(null)
    noteStatuses.current = next
  }, [notes, activeNoteId])

  useEffect(() => {
    for (const tab of tabs) if (isDocument(tab)) setAnnotations(editors[tab.id], tab.id === contextTab?.id ? notes.filter((note) => noteIsShown(note, noteView, activeNoteId, foldText(noteSearch.trim()))) : [], activeNoteId)
  }, [notes, activeNoteId, noteView, noteSearch, editors, tabs, contextTab?.id])

  // DOCX o PDF aperti dal progetto: appena l'editor li ha caricati si salvano come Markdown con lo stesso nome, e la scheda passa a quel file.
  const converting = useRef(new Set())
  useEffect(() => {
    for (const tab of tabs) {
      const editor = editors[tab.id]
      if (!tab.convertTo || !editor || converting.current.has(tab.id)) continue
      converting.current.add(tab.id)
      electronAPI.saveMarkdown({ filePath: tab.convertTo, markdown: editor.getMarkdown(), saveAs: false })
        .then((saved) => {
          if (saved) { workspaceRef.current.markSaved(tab.id, saved); setStatus(t('Converted to Markdown: {name}', { name: baseName(saved) })) }
          else setTabs((current) => current.map((item) => (item.id === tab.id ? { ...item, convertTo: undefined } : item)))
        })
        .catch((error) => {
          console.error(error)
          setStatus(t('Could not convert the document to Markdown'))
          setTabs((current) => current.map((item) => (item.id === tab.id ? { ...item, convertTo: undefined } : item)))
        })
        .finally(() => converting.current.delete(tab.id))
    }
  }, [tabs, editors])

  const selectBookmark = useCallback((id) => {
    setActiveBookmarkId(id)
    setSideTab('bookmarks')
  }, [])

  const selectNote = useCallback((id) => {
    setActiveNoteId(id)
    setSideTab('notes')
  }, [])

  useDocumentFileCommands({ activeTab, getEditor, workspace, onStatusChange: setStatus })

  const openFileRef = useRef(null)

  // Ctrl+clic su un collegamento del documento: file locale (si apre in una scheda), indirizzo web (nel browser di sistema) o ancora.
  // Va al punto di un documento indicato da `#nome`: un segnalibro, o un titolo con quel nome. `filePath` vuoto = il documento in primo piano.
  // Se il documento si sta ancora aprendo, aspetta che l'editor sia pronto (fino a 4 secondi).
  async function goToFragment(filePath, fragment) {
    if (!fragment) return
    const deadline = Date.now() + 4000
    for (;;) {
      const { tabs: currentTabs, editors: currentEditors, activeId: currentActive } = latest.current
      const tab = filePath
        ? currentTabs.find((item) => isLive(item) && (samePath(item.filePath, filePath) || samePath(item.sourcePath, filePath)))
        : currentTabs.find((item) => item.id === currentActive && isLive(item))
      const editor = tab && currentEditors[tab.id]
      if (editor && !editor.isDestroyed) {
        const list = tab.filePath ? await electronAPI.listBookmarks(tab.filePath).catch(() => []) : []
        const found = findFragmentTarget(editor, list, fragment)
        if (!found) { setStatus(t('Nothing named "{name}" in this document', { name: fragment })); return }
        setActiveId(tab.id)
        const match = list.find((item) => item.name.toLowerCase() === fragment.toLowerCase())
        if (match) setActiveBookmarkId(match.id)
        editor.chain().focus().setTextSelection({ from: found.from, to: found.to }).scrollIntoView().run()
        return
      }
      if (Date.now() > deadline) return
      await sleep(100)
    }
  }

  function openLink(target) {
    if (target.kind === 'anchor') goToFragment(null, target.fragment)
    else if (target.kind === 'file') openFromExplorer(target.path).then(() => goToFragment(target.path, target.fragment))
    else if (target.kind === 'external') electronAPI.openLink(target.url)
    else if (target.kind === 'unresolved') setStatus(t('Save the document first to follow relative links'))
  }
  const workspaceRef = useRef(null)

  // Documenti aperti con modifiche da salvare e già associati a un file (gli altri chiederebbero dove salvare, uno per uno).
  // Un documento con modifiche dell'assistente ancora da rivedere conta come da salvare anche se il testo coincide col file: salvandolo si accettano.
  const hasPendingEdits = (tab) => { const editor = latest.current.editors[tab.id]; return Boolean(editor && !editor.isDestroyed && getPending(editor.state).length) }
  const unsavedTabs = (currentTabs) => currentTabs.filter((tab) => isLive(tab) && tab.filePath && (tab.dirty || hasPendingEdits(tab)))

  // Salva tutte le schede modificate. Le modifiche dell'assistente ancora da rivedere si accettano: con conferma, perché è una scelta irreversibile
  // per il segno "da rivedere" (il testo precedente resta comunque nella cronologia).
  async function saveAllTabs() {
    const { tabs: currentTabs, editors: currentEditors } = latest.current
    const targets = unsavedTabs(currentTabs).filter((tab) => currentEditors[tab.id])
    const skipped = currentTabs.filter((tab) => isLive(tab) && tab.dirty && !tab.filePath).length
    if (!targets.length) { setStatus(t('No documents to save')); return }
    const pending = targets.filter((tab) => getPending(currentEditors[tab.id].state).length)
    if (pending.length) {
      const message = t('Save {count} documents? {pending} of them have edits by the assistant still to review: saving accepts them all.', { count: targets.length, pending: pending.length })
      if (!(await dialogsRef.current.confirm(message, { confirmLabel: t('Save and accept all') }))) return
    }
    let saved = 0
    for (const tab of targets) {
      const editor = latest.current.editors[tab.id]
      if (!editor) continue
      if (getPending(editor.state).length) acceptAll(editor)
      if (await workspaceRef.current.saveTab(tab.id)) saved += 1
    }
    setStatus(skipped
      ? t('Saved {count} documents; {skipped} not saved yet (they have no file)', { count: saved, skipped })
      : t('Saved {count} documents', { count: saved }))
  }
  workspaceRef.current = workspace

  // `options`: { preview, permanent } valgono per le schede (vedi openDocument); il resto (es. { original }) va al processo principale.
  async function openFromExplorer(filePath, options) {
    const { preview, permanent, ...ipcOptions } = options || {}
    // Un'immagine si apre nella scheda di visualizzazione, senza passare dal lettore dei documenti.
    if (isImageFile(filePath)) { workspace.openImage(filePath, { preview, permanent }); return }
    try {
      workspace.openDocument(await electronAPI.openDocumentPath(filePath, ipcOptions), { preview, permanent })
    } catch (error) {
      console.error(error)
      setStatus(t('Could not open the file'))
    }
  }

  openFileRef.current = openFromExplorer

  // Documenti aperti dal sistema (doppio clic su un .md, "Apri con"): quelli arrivati prima dell'avvio, poi quelli successivi.
  useEffect(() => {
    if (!ready || !electronAPI?.onExternalDocument) return undefined
    const open = (document) => workspaceRef.current.openDocument(document)
    electronAPI.takeExternalDocuments().then((list) => list.forEach(open)).catch((error) => console.error(error))
    return electronAPI.onExternalDocument(open)
  }, [ready])

  const openDocuments = useMemo(() => tabs.filter(isLive).map((item) => ({ id: item.id, title: item.title })), [tabs])

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
          onSettings={() => openSettings()}
          update={updateRelease}
          onUpdate={() => { setAboutCheck(false); setAboutOpen(true) }}
        />
        {sideTab && (
          <aside style={{ width: widths.left }} className="relative flex shrink-0 flex-col border-r border-slate-800 bg-slate-900/60">
            <PanelResizer side="left" label={t('Side panel width')} width={widths.left} min={PANELS.left.min} max={maxWidthFor('left', resizeContext('left'))} defaultWidth={PANELS.left.default} onChange={resizePanel('left')} onCommit={commitLayout} />
            <h2 className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{sideTabs.find((item) => item.id === sideTab)?.label}</h2>
            {sideTab === 'projects' && <ProjectsPanel project={project} onMove={moveProject} onOpenFile={(file) => openFromExplorer(file)} onOpen={openProject} onChoose={chooseProject} onCreate={createProject} onSettingsChanged={() => setSettingsVersion((value) => value + 1)} />}
            {sideTab === 'files' && (
              <FileExplorer project={project} activePath={activeTab.kind === 'image' ? activeTab.imagePath : contextTab?.sourcePath} refreshToken={explorerRefresh} expandedPaths={expandedPaths} onToggle={toggleExpanded} onChooseProject={chooseProject} onOpenProject={openProject} onOpenFile={openFromExplorer} onStatus={setStatus} onRenamed={workspace.pathRenamed} onDeleted={workspace.pathDeleted} onSettingsChanged={() => setSettingsVersion((value) => value + 1)} />
            )}
            {sideTab === 'outline' && <OutlinePanel editor={editors[contextTab?.id]} />}
            {sideTab === 'notes' && (editors[contextTab?.id]
              ? <NotesPanel noteView={noteView} onNoteViewChange={(view) => { setNoteView(view); setActiveNoteId(null) }} search={noteSearch} onSearchChange={setNoteSearch} tab={contextTab} editor={editors[contextTab.id]} project={workspaceRoot} notes={notes} activeNoteId={activeNoteId} onSelectNote={setActiveNoteId} onChanged={() => setNotesVersion((value) => value + 1)} onStatus={setStatus} onAskAi={(text, attachment) => { setAssistantOpen(true); setChatRequest({ id: Date.now(), text, attachment }) }} />
              : <p className="px-3 py-3 text-xs text-slate-500">{t('No document open.')}</p>)}
            {sideTab === 'bookmarks' && (editors[contextTab?.id]
              ? <BookmarksPanel tab={contextTab} editor={editors[contextTab.id]} project={workspaceRoot} bookmarks={bookmarks} activeId={activeBookmarkId} onSelect={setActiveBookmarkId} onChanged={() => setBookmarksVersion((value) => value + 1)} onStatus={setStatus} onAskAi={(text, attachment) => { setAssistantOpen(true); setChatRequest({ id: Date.now(), text, attachment }) }} onOpenBookmark={(path, name) => openLink({ kind: 'file', path, fragment: name })} />
              : <p className="px-3 py-3 text-xs text-slate-500">{t('No document open.')}</p>)}
            {sideTab === 'memory' && <MemoryPanel project={workspaceRoot} memoryVersion={memoryVersion} activePath={contextTab?.filePath ? relativeToProject(project, contextTab.filePath) : null} onOpenFile={(relative) => openFromExplorer(`${project}/${relative}`)} onStatus={setStatus} />}
            {sideTab === 'info' && <InfoPanel tab={contextTab} editor={editors[contextTab?.id]} project={workspaceRoot} historyVersion={historyVersion} openNotes={notes.filter((note) => note.status === 'open').length} bookmarkCount={bookmarks.length} />}
            {sideTab === 'history' && (
              <HistoryPanel tab={contextTab} editor={editors[contextTab?.id]} project={workspaceRoot} historyVersion={historyVersion} onChanged={() => setHistoryVersion((value) => value + 1)} onStatus={setStatus} />
            )}
          </aside>
        )}
        <main className="flex min-w-0 flex-1 flex-col">
          <TabBar tabs={tabs} onPromote={workspace.promoteTab} unsavedCount={unsavedTabs(tabs).length} onSaveAll={saveAllTabs} activeId={activeTab.id} onSelect={setActiveId} onClose={workspace.closeTab} onTogglePin={workspace.togglePin} onMove={workspace.moveTab} onNew={workspace.newTab} onNewBrowser={workspace.openBrowser} assistantOpen={assistantOpen} onToggleAssistant={() => setAssistantOpen((open) => !open)} />
          <section className="flex min-h-0 flex-1 flex-col bg-slate-900">
            {tabs.map((tab) => (tab.kind === 'image'
              ? <ImagePane key={tab.id} tab={tab} active={tab.id === activeTab.id} onStatus={setStatus} onInteract={workspace.promoteTab} onNavigate={workspace.changeImage} />
              : tab.kind === 'browser'
              ? <BrowserPane key={tab.id} tab={tab} active={tab.id === activeTab.id} onRegister={registerBrowser} onTitle={workspace.setTitle} onStatus={setStatus} onScreenshot={() => setExplorerRefresh((value) => value + 1)} onSaved={(saved) => { setExplorerRefresh((value) => value + 1); openFromExplorer(saved) }} />
              : <DocumentPane key={tab.id} tab={tab} project={project} onReopen={() => workspace.reopenTab(tab.id)} onSave={async () => { if (await workspace.saveTab(tab.id)) setStatus(t('Saved')) }} onOpenLink={openLink} onStatus={setStatus} active={tab.id === activeTab.id} findRequest={findRequest} onReady={registerEditor} onDirty={workspace.markDirty} onClean={workspace.markClean} onInteract={workspace.promoteTab} onPendingRestored={workspace.clearPendingData} onPendingChange={workspace.pendingChanged} onCheckAi={() => workspace.requestAiCheck(tab.id)} onNoteSelect={selectNote} onBookmarkSelect={selectBookmark} />))}
          </section>
          <footer className="flex shrink-0 items-center justify-between gap-4 border-t border-slate-800 bg-slate-950 px-3 py-1 text-xs text-slate-500">
            <span className="truncate" title={project || ''}>{project ? t('Project: {project}', { project }) : t('No project')}</span>
            <span className="shrink-0">{status}</span>
          </footer>
        </main>
        {/* Sempre montato: chiudere il pannello non interrompe una richiesta in corso. */}
        <aside style={{ width: widths.right }} className={assistantOpen ? 'relative flex min-w-0 shrink-0 flex-col overflow-hidden border-l border-slate-800 bg-slate-900/60' : 'hidden'}>
          {assistantOpen && <PanelResizer side="right" label={t('Assistant width')} width={widths.right} min={PANELS.right.min} max={maxWidthFor('right', resizeContext('right'))} defaultWidth={PANELS.right.default} onChange={resizePanel('right')} onCommit={commitLayout} />}
          <AiChatPanel
            editor={editors[contextTab?.id]}
            contextTab={contextTab}
            openDocuments={openDocuments}
            contextPins={contextPins}
            onContextPinsChange={setContextPins}
            toolBridge={toolBridge}
            request={chatRequest} onRequestHandled={() => setChatRequest(null)}
            onOpenNote={selectNote}
            project={workspaceRoot}
            loose={!project}
            settingsVersion={settingsVersion}
            conversationId={conversationId}
            onConversationChange={setConversationId}
            onOpenSettings={() => openSettings('ai')}
            onOpenProjects={() => setSideTab('projects')}
          />
        </aside>
      </div>
      {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items} onClose={() => setContextMenu(null)} />}
      {updateRelease && updateNoticeVisible && (
        <div className="fixed bottom-12 right-6 z-30 flex max-w-md items-center gap-4 rounded-xl border border-accent-500/50 bg-slate-900 p-4 text-sm shadow-xl">
          <div className="min-w-0">
            <strong className="block text-slate-50">{t('Update available: v{version}', { version: updateRelease.version })}</strong>
            <span className="block text-xs text-slate-400">{t('You are using v{current}.', { current: appVersion })}</span>
          </div>
          <button type="button" className="shrink-0 rounded-md bg-accent-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-500" onClick={() => electronAPI.openRelease(updateRelease.url)}>{t('Download latest build')}</button>
          <button type="button" aria-label={t('Dismiss')} className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-50" onClick={() => setUpdateNoticeVisible(false)}>×</button>
        </div>
      )}
      {aboutOpen && <AboutDialog version={appVersion} release={updateRelease} checkOnOpen={aboutCheck} onCheck={() => checkForUpdate(false)} onClose={() => setAboutOpen(false)} />}
      {screen === 'settings' && <SettingsScreen initialSection={settingsSection} project={project} onMoveProject={moveProject} version={appVersion} release={updateRelease} onCheckUpdate={() => checkForUpdate(false)} onChooseProject={chooseProject} onOpenFile={(file) => { setScreen('editor'); setSettingsVersion((value) => value + 1); openFromExplorer(file) }} onBack={() => { setScreen('editor'); setSettingsVersion((value) => value + 1) }} />}
    </ContextMenuContext.Provider>
  )
}
