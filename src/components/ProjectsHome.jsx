import { Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, RefreshCw, Search, Sparkles, WholeWord, X } from 'lucide-react'
import ProjectGraph from './ProjectGraph.jsx'
import ProjectSettingsDialog from './ProjectSettingsDialog.jsx'
import WorkspaceSelector from './WorkspaceSelector.jsx'
import useWorkspaces from '../hooks/useWorkspaces.js'
import { pruneLayouts } from '../lib/graphLayoutStore.js'
import { ContextMenuContext } from './ContextMenu.jsx'
import PanelResizer from './PanelResizer.jsx'
import { ProjectAvatar } from './ProjectIcon.jsx'
import { isInsidePath, samePath } from '../lib/pathCompare.js'
import { RESULTS_PANEL, loadResultsWidth, saveResultsWidth } from '../lib/layout.js'
import { expansionMessages, parseExpansion } from '../lib/queryExpansion.js'
import { getPreference, setPreference } from '../lib/preferences.js'
import { createSynonymCache, synonymKey } from '../lib/synonymCache.js'
import { snippetTokens } from '../lib/snippetMarkdown.js'
import { t, tp } from '../i18n/index.js'

const electronAPI = window.electronAPI
const REVEAL_LABEL = /Win/.test(navigator.platform) ? t('Show in File Explorer') : /Mac/.test(navigator.platform) ? t('Reveal in Finder') : t('Show in file manager')
const MIN_QUERY = 2
const DEBOUNCE_MS = 450
const SYNONYMS_KEY = 'openwriter.homeSynonyms'
const WHOLE_KEY = 'openwriter.homeWholeWords'
const EXPANSION_TIMEOUT_MS = 15000
// Sinonimi già chiesti al modello: la stessa parola (con lo stesso modello) non si chiede due volte, nemmeno tra una sessione e l'altra (30 giorni, al più 300 parole).
const synonymCache = createSynonymCache({ read: () => getPreference('openwriter.synonymCache'), write: (text) => setPreference('openwriter.synonymCache', text) })

// Memoria della Home. Cambiando progetto l'app mostra la schermata di caricamento al posto di tutto e smonta anche la Home: la ricerca (testo, risultati, sinonimi,
// «meno pertinenti» mostrati, posizione nell'elenco) sta quindi qui fuori e al ritorno è com'era, finché l'app resta aperta. `done`: la ricerca già fatta (testo e
// impostazione dei sinonimi), che al ritorno non si ripete.
const memory = { query: '', search: null, expansion: null, showWeak: false, weakLoaded: false, scrollTop: 0, done: null }
const blankSearch = () => ({ state: 'idle', results: [], partial: false, weakCount: 0, error: '', query: '', localTerms: [] })

// Chiede al modello linguistico i sinonimi della ricerca: il modello di ricerca (impostazioni → assistente di ricerca) se è attivo, altrimenti quello dell'assistente.
// Vede solo la parola cercata. `use`: { provider, model } del modello di ricerca, o null; `modelId`: identifica il modello che risponde (per la cache). Fallisce con un messaggio comprensibile.
async function expandQuery(text, use, modelId) {
  const key = synonymKey(text, modelId)
  const remembered = synonymCache.get(key)
  if (remembered) return remembered
  const request = electronAPI.ai.chatStream(expansionMessages(text), () => {}, { reasoningCap: 'instant', ...(use ? { use } : {}) })
  let timer
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => { request.cancel(); reject(new Error(t('The AI took too long to answer'))) }, EXPANSION_TIMEOUT_MS) })
  try {
    const terms = parseExpansion(await Promise.race([request.promise, timeout]), text)
    synonymCache.set(key, terms)
    return terms
  } finally { clearTimeout(timer) }
}

// L'estratto di un passaggio: Markdown grezzo, tagliato, con le parole trovate tra « ». Si legge in modo tollerante (snippetMarkdown.js): niente simboli di formattazione,
// grassetto, corsivo, barrato e codice in linea, e le parole trovate evidenziate.
function Snippet({ text }) {
  const tokens = useMemo(() => snippetTokens(text), [text])
  return (
    <>
      {tokens.map((token, index) => {
        let node = token.text
        if (token.code) node = <code className="rounded bg-slate-800 px-1 font-mono text-[11px] text-slate-300">{node}</code>
        if (token.strike) node = <del className="opacity-70">{node}</del>
        if (token.italic) node = <em>{node}</em>
        if (token.bold) node = <strong className="font-semibold text-slate-300">{node}</strong>
        if (token.mark) node = <mark className="rounded bg-accent-500/25 px-0.5 text-slate-50">{node}</mark>
        return <Fragment key={index}>{node}</Fragment>
      })}
    </>
  )
}

// Il colore della barra di pertinenza, a semaforo: sotto il 33% rosso, dal 33% al 66% giallo, sopra il 66% verde (sulla percentuale mostrata).
const relevanceColor = (percent) => (percent < 33 ? 'bg-rose-500' : percent <= 66 ? 'bg-amber-400' : 'bg-emerald-500')

// Il fattore di pertinenza di un passaggio: una barra a semaforo e la percentuale. Dice quanto si stacca dagli altri per questa ricerca (e, se contiene le parole, almeno "buono").
function Relevance({ value, z }) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100)
  const title = t('Relevance {percent}%: how much this passage stands out from the others for this search{detail}', { percent, detail: z === undefined ? '' : ` (z ${z})` })
  return (
    <span title={title} aria-label={title} className="flex shrink-0 items-center gap-1.5 text-[10px] tabular-nums text-slate-400">
      <span className="h-1 w-10 overflow-hidden rounded-full bg-slate-700"><span className={`block h-full rounded-full ${relevanceColor(percent)}`} style={{ width: `${percent}%` }} /></span>
      {percent}%
    </span>
  )
}

/**
 * La Home dei progetti: la rete dei progetti (bolle con le icone, sinapsi tra quelli affini) e, sopra, una ricerca per significato come la farebbe un agente.
 * I risultati compaiono in un pannello sovrapposto; le bolle con risultati si illuminano. `onOpenProject(percorso)`, `onOpenResult(passaggio)`.
 */
export default function ProjectsHome({ project, visible = true, projectsVersion = 0, onOpenProject, onOpenResult, onMove, onOpenFile, onSettingsChanged }) {
  // Tasto destro su una bolla: menu del progetto (apri, impostazioni, sposta, mostra nel file manager). Le impostazioni si aprono nella stessa finestra della lista dei progetti.
  const openMenu = useContext(ContextMenuContext)
  const { active: activeId, activeWorkspace, workspaces, loaded: workspacesLoaded } = useWorkspaces()
  // Dove cerca la ricerca: «tutti» o uno spazio di lavoro. Parte dallo spazio attivo (e lo segue quando cambia); con l'elenco degli spazi vuoto la scelta non esiste.
  const [scope, setScope] = useState('all')
  useEffect(() => { setScope(activeId) }, [activeId])
  // Uno spazio eliminato mentre era scelto: si torna a quello attivo.
  useEffect(() => { if (workspacesLoaded && scope !== 'all' && !workspaces.some((item) => item.id === scope)) setScope(activeId) }, [workspaces, workspacesLoaded, scope, activeId])
  // Gli spazi eliminati lasciano la loro disposizione delle bolle: si toglie (solo quando l'elenco degli spazi è arrivato).
  useEffect(() => { if (workspacesLoaded) pruneLayouts(workspaces.map((item) => item.id)) }, [workspaces, workspacesLoaded])
  const [settingsFor, setSettingsFor] = useState(null)
  const [graph, setGraph] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState(memory.query)
  const [search, setSearch] = useState(() => (memory.search && memory.search.state !== 'loading' ? memory.search : blankSearch()))
  // "Mostra anche meno pertinenti": i passaggi scartati dal filtro si chiedono una volta (`weakLoaded`) e si mostrano o nascondono qui, senza nuova ricerca.
  const [showWeak, setShowWeak] = useState(memory.showWeak)
  const weakLoaded = useRef(memory.weakLoaded)
  // Sinonimi con l'IA: acceso di default (si ricorda la scelta); se l'IA non è attiva la ricerca resta quella di prima e lo dice.
  const [synonyms, setSynonyms] = useState(() => getPreference(SYNONYMS_KEY) !== '0')
  // «Parole intere»: cerca la frase scritta, parole intere e nell'ordine, senza sinonimi né significato (si ricorda la scelta).
  const [whole, setWhole] = useState(() => getPreference(WHOLE_KEY) === '1')
  const [aiOn, setAiOn] = useState(true)
  const [researchModel, setResearchModel] = useState(null) // { provider, model } se il modello di ricerca è attivo
  const [modelId, setModelId] = useState('') // il modello che risponde per i sinonimi (provider:modello), chiave della cache
  const [rerun, setRerun] = useState(0) // «Aggiorna» rifà anche la ricerca in corso (l'indice può essere cambiato)
  const [expansion, setExpansion] = useState(() => (memory.expansion && ['done', 'off', 'failed'].includes(memory.expansion.state) ? memory.expansion : { state: 'idle', terms: [], error: '' }))
  useEffect(() => { memory.query = query; memory.search = search; memory.expansion = expansion; memory.showWeak = showWeak; memory.weakLoaded = weakLoaded.current }, [query, search, expansion, showWeak])
  // Il modello di ricerca, se impostato e attivo, funziona anche con l'assistente spento (come per lo strumento `research` della chat).
  useEffect(() => {
    electronAPI.ai?.getSettings?.().then((settings) => {
      const researcher = settings?.researcher?.enabled && settings.researcher.model ? { provider: settings.researcher.provider, model: settings.researcher.model } : null
      setResearchModel(researcher)
      setModelId(researcher ? `${researcher.provider}:${researcher.model}` : `${settings?.provider || ''}:${settings?.providers?.[settings?.provider]?.model || ''}`)
      setAiOn(Boolean(researcher) || Boolean(settings?.aiEnabled))
    }).catch(() => setAiOn(false))
  }, [])
  const toggleWhole = () => setWhole((current) => { const next = !current; setPreference(WHOLE_KEY, next ? '1' : '0'); return next })
  const toggleSynonyms = () => setSynonyms((current) => { const next = !current; setPreference(SYNONYMS_KEY, next ? '1' : '0'); return next })
  const sequence = useRef(0)
  const input = useRef(null)
  // Pannello dei risultati: ancorato a destra, si allarga verso sinistra; la larghezza scelta si ricorda. Non può superare lo spazio della Home.
  const sectionRef = useRef(null)
  const scrollRef = useRef(null)
  // Tornando nella Home, l'elenco dei risultati riparte da dove era.
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = memory.scrollTop }, [])
  const [room, setRoom] = useState(1200)
  const [width, setWidth] = useState(loadResultsWidth)
  const widthRef = useRef(width)
  useEffect(() => {
    const element = sectionRef.current
    if (!element) return undefined
    const observer = new ResizeObserver(() => setRoom(element.clientWidth || 1200))
    observer.observe(element)
    setRoom(element.clientWidth || 1200)
    return () => observer.disconnect()
  }, [])
  const maxWidth = Math.max(RESULTS_PANEL.min, Math.min(RESULTS_PANEL.max, room - 24))
  const panelWidth = Math.min(width, maxWidth)
  const resizePanel = (value) => {
    const next = Math.round(Math.min(maxWidth, Math.max(RESULTS_PANEL.min, value)))
    widthRef.current = next
    setWidth(next)
  }

  // `silent`: riletture in secondo piano (ritorno alla Home, indice che lavora): niente rotellina sul pulsante. `refresh`: il pulsante Aggiorna, che riallinea anche l'indice dei progetti mai aperti.
  const load = useCallback(async ({ silent = false, refresh = false } = {}) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const next = await electronAPI.getProjectGraph(refresh ? { refresh: true } : undefined)
      // Se nulla è cambiato si tiene il grafo di prima: la rete non si ricompone e le bolle restano dove sono.
      setGraph((current) => (current && JSON.stringify(current) === JSON.stringify(next) ? current : next))
    } catch (reason) { setError(reason.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load, project])
  // La Home resta montata anche nascosta: al ritorno si riallinea (un indice può essere cambiato nel frattempo) e, finché l'indice lavora (scansione o vettori ancora da
  // calcolare), si riguarda ogni pochi secondi: un progetto appena aggiunto si collega da solo quando i suoi vettori sono pronti.
  const busy = Boolean(graph?.busy)
  useEffect(() => { if (visible) load({ silent: true }) }, [visible, load])
  // Con più finestre dell'app, quando questa torna in primo piano si rilegge ciò che l'altra può aver cambiato: i dati del grafo (spazio di lavoro, membri temporanei,
  // progetti) e la disposizione delle bolle.
  const [layoutVersion, setLayoutVersion] = useState(0)
  useEffect(() => {
    if (!visible) return undefined
    const refocus = () => { if (document.visibilityState === 'hidden') return; load({ silent: true }); setLayoutVersion((value) => value + 1) }
    window.addEventListener('focus', refocus)
    document.addEventListener('visibilitychange', refocus)
    return () => { window.removeEventListener('focus', refocus); document.removeEventListener('visibilitychange', refocus) }
  }, [visible, load])
  // L'elenco dei progetti è cambiato accanto alla Home (uno tolto, spostato, rinominato): il grafo si ricarica subito.
  useEffect(() => { if (projectsVersion) load({ silent: true }) }, [projectsVersion, load])
  useEffect(() => {
    if (!visible || !busy) return undefined
    const timer = setInterval(() => load({ silent: true }), 5000)
    return () => clearInterval(timer)
  }, [visible, busy, load])

  // La ricerca parte da sola poco dopo l'ultimo tasto; una risposta arrivata in ritardo (di una domanda già cambiata) si scarta.
  // Prima la ricerca semplice (subito), poi, con i sinonimi acceso, si chiedono al modello e si cerca di nuovo con quelli.
  useEffect(() => {
    const text = query.trim()
    if (Array.from(text).length < MIN_QUERY) {
      sequence.current += 1
      memory.done = null
      memory.scrollTop = 0
      setSearch(blankSearch())
      setExpansion({ state: 'idle', terms: [], error: '' })
      setShowWeak(false)
      weakLoaded.current = false
      return undefined
    }
    // Ricerca già fatta (tornando nella Home): si tengono i risultati com'erano, senza ripeterla né richiamare l'IA.
    if (memory.done && memory.done.query === text && memory.done.synonyms === synonyms && memory.done.whole === whole && memory.done.scope === scope) return undefined
    const mine = ++sequence.current
    const stale = () => mine !== sequence.current
    const timer = setTimeout(async () => {
      memory.done = null
      memory.scrollTop = 0
      setSearch((current) => ({ ...current, state: 'loading', error: '' }))
      setExpansion({ state: 'idle', terms: [], error: '' })
      setShowWeak(false)
      weakLoaded.current = false
      const finished = () => { if (!stale()) memory.done = { query: text, synonyms, whole, scope } }
      // I sinonimi dell'IA, se attiva, partono subito, insieme alla prima ricerca (che include già i sinonimi locali): non aspettano il risultato.
      const aiTerms = synonyms && aiOn && !whole ? expandQuery(text, researchModel, modelId) : null
      aiTerms?.catch(() => {})
      try {
        const answer = await electronAPI.searchProjects({ query: text, maxResults: 20, local: synonyms, exact: whole, workspace: scope })
        if (stale()) return
        setSearch({ state: 'done', results: answer.results, partial: Boolean(answer.partial), weakCount: answer.weakCount || 0, error: '', query: text, localTerms: answer.localTerms || [] })
      } catch (reason) {
        if (!stale()) setSearch({ state: 'error', results: [], partial: false, weakCount: 0, error: reason.message, query: text })
        return
      }
      if (!synonyms || whole) { finished(); return }
      if (!aiOn) { setExpansion({ state: 'off', terms: [], error: '' }); finished(); return }
      setExpansion({ state: 'loading', terms: [], error: '' })
      try {
        const terms = await aiTerms
        if (stale()) return
        if (!terms.length) { setExpansion({ state: 'done', terms: [], error: '' }); finished(); return }
        setExpansion({ state: 'searching', terms, error: '' })
        const answer = await electronAPI.searchProjects({ query: text, terms, maxResults: weakLoaded.current ? 30 : 20, includeWeak: weakLoaded.current, workspace: scope })
        if (stale()) return
        setSearch({ state: 'done', results: answer.results, partial: Boolean(answer.partial), weakCount: answer.weakCount || 0, error: '', query: text, localTerms: answer.localTerms || [] })
        setExpansion({ state: 'done', terms, error: '' })
        finished()
      } catch (reason) {
        if (!stale()) setExpansion({ state: 'failed', terms: [], error: reason.message })
        finished()
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, synonyms, whole, aiOn, researchModel, modelId, rerun, scope])

  const nodes = graph?.nodes || []
  const known = useMemo(() => new Map(nodes.map((node) => [node.path, node])), [nodes])
  const nodeFor = useCallback((directory) => nodes.find((node) => samePath(node.path, directory)) || null, [nodes])

  // Senza "meno pertinenti" si nascondono i passaggi scartati dal filtro; con quello si mostrano tutti, per pertinenza (come li ordina l'indice).
  const visibleResults = useMemo(() => (showWeak ? search.results : search.results.filter((hit) => !hit.weak)), [search.results, showWeak])

  // Per progetto: i passaggi trovati, nell'ordine di rilevanza.
  const groups = useMemo(() => {
    const byProject = new Map()
    for (const hit of visibleResults) {
      const node = nodeFor(hit.project)
      const key = node?.path || hit.project
      if (!byProject.has(key)) byProject.set(key, { path: key, name: node?.name || hit.projectName, hits: [] })
      byProject.get(key).hits.push(hit)
    }
    return [...byProject.values()]
  }, [visibleResults, nodeFor])
  // Nel grafo si evidenzia il progetto che contiene i passaggi e, se stanno in un sotto-progetto (anche non aperto da solo), anche quel satellite: il più interno che contiene il file.
  // Il valore è la pertinenza (0-1) del suo passaggio migliore: più è pertinente, più la bolla brilla (senza ricerca per significato, un valore medio).
  const matches = useMemo(() => {
    if (search.state !== 'done' || !groups.length) return null
    const strength = new Map()
    const raise = (key, value) => strength.set(key, Math.max(strength.get(key) ?? 0, value))
    const subs = nodes.filter((node) => node.parent)
    for (const hit of visibleResults) {
      const value = hit.relevance ?? 0.6
      const node = nodeFor(hit.project)
      raise(node?.path || hit.project, value)
      let inner = null
      for (const sub of subs) if (isInsidePath(hit.absolute, sub.path) && (!inner || isInsidePath(sub.path, inner.path))) inner = sub
      if (inner) raise(inner.path, value)
    }
    return strength
  }, [search.state, groups, visibleResults, nodes, nodeFor])

  // Chiede (una volta) anche i passaggi meno pertinenti, poi li mostra. Gli stessi sinonimi già trovati restano nella ricerca.
  const [weakBusy, setWeakBusy] = useState(false)
  async function revealWeak() {
    if (weakLoaded.current) { setShowWeak(true); return }
    setWeakBusy(true)
    try {
      const answer = await electronAPI.searchProjects({ query: search.query, terms: expansion.terms, maxResults: 30, includeWeak: true, exact: whole, workspace: scope })
      weakLoaded.current = true
      setSearch((current) => (current.query === search.query ? { ...current, results: answer.results, partial: Boolean(answer.partial), weakCount: answer.weakCount || current.weakCount } : current))
      setShowWeak(true)
    } catch (reason) {
      setSearch((current) => ({ ...current, error: reason.message }))
    } finally { setWeakBusy(false) }
  }
  const weakShown = search.results.filter((hit) => hit.weak).length
  const canRevealWeak = search.state === 'done' && !showWeak && search.weakCount > 0
  const revealButton = (
    <button type="button" disabled={weakBusy} className="flex w-full items-center justify-center gap-1.5 px-3 py-2 text-xs text-accent-400 underline decoration-accent-400/40 underline-offset-2 transition hover:text-accent-300 hover:decoration-accent-300 disabled:opacity-60" onClick={revealWeak}>
      {weakBusy && <Loader2 size={12} className="animate-spin" />}{t('Show less relevant too')}
    </button>
  )

  const active = nodes.find((node) => project && samePath(node.path, project))?.path || null
  const sharing = nodes.filter((node) => node.shared && node.chunks > 0).length
  const showPanel = query.trim().length >= MIN_QUERY

  function openProjectMenu(path, x, y) {
    const node = nodes.find((item) => item.path === path)
    if (!node || node.missing) return
    const isOpen = project && samePath(path, project)
    openMenu({
      x,
      y,
      items: [
        !isOpen && { label: t('Open'), onClick: () => onOpenProject(path) },
        !isOpen && { label: t('Open in a new window'), onClick: () => electronAPI.openProjectInNewWindow(path).catch((reason) => setError(String(reason.message || '').replace(/^Error invoking remote method '[^']*': (Error: )?/, ''))) },
        { label: t('Project settings…'), onClick: () => setSettingsFor(node) },
        { separator: true },
        onMove && { label: t('Move…'), onClick: async () => { try { if (await onMove(path)) load({ silent: true }) } catch (reason) { setError(reason.message) } } },
        { label: REVEAL_LABEL, onClick: () => electronAPI.revealProject(path).catch((reason) => setError(reason.message)) },
        // Un progetto aperto da un agente è un membro temporaneo dello spazio attivo: lo si aggiunge o lo si ignora. Altrimenti, dentro uno spazio, lo si può togliere da lì.
        (node.temporary || activeWorkspace) && { separator: true },
        node.temporary && { label: t('Add to the workspace'), onClick: () => electronAPI.adoptTemporaryProject(path).catch((reason) => setError(reason.message)) },
        node.temporary && { label: t('Ignore'), onClick: () => electronAPI.dismissTemporaryProject(path).catch((reason) => setError(reason.message)) },
        !node.temporary && activeWorkspace && { label: t('Remove from workspace'), danger: true, onClick: () => electronAPI.removeProjectFromWorkspace(activeWorkspace.id, path).catch((reason) => setError(reason.message)) },
      ].filter(Boolean),
    })
  }

  return (
    <section ref={sectionRef} className="relative flex min-h-0 flex-1 flex-col bg-slate-950" aria-label={t('Projects home')}>
      {/* Centrata nello spazio libero: con i risultati aperti si sposta per non finirci sotto. */}
      <div style={{ left: 0, right: showPanel ? panelWidth + 12 : 0, marginInline: 'auto' }} className="pointer-events-none absolute top-0 z-10 flex max-w-xl items-start gap-2 px-3 pb-3 pt-5">
        {/* Un gruppo di campi: prima la scelta di dove cercare (tutti i progetti o uno spazio di lavoro; assente se non ce ne sono), poi la ricerca. */}
        <div className="pointer-events-auto flex min-w-0 flex-1 items-stretch rounded-lg border border-slate-700 bg-slate-900/90 shadow-lg backdrop-blur focus-within:border-accent-400">
        {workspaces.length > 0 && <WorkspaceSelector embedded value={scope} onChange={setScope} />}
        <label className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2">
          <Search size={15} className="shrink-0 text-slate-500" />
          <input
            ref={input}
            value={query}
            placeholder={t('Search projects…')}
            aria-label={t('Search all your projects')}
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Escape') { setQuery(''); event.stopPropagation() } }}
          />
          {search.state === 'loading' && <Loader2 size={14} className="shrink-0 animate-spin text-slate-500" aria-label={t('Searching…')} />}
          <button type="button" aria-pressed={whole} aria-label={t('Whole words')} title={whole ? t('Whole words: on (the exact phrase, whole words in the order written; no synonyms or meaning)') : t('Whole words: off')} className={`shrink-0 transition ${whole ? 'text-accent-400' : 'text-slate-500 hover:text-slate-200'}`} onClick={toggleWhole}><WholeWord size={15} /></button>
          <button type="button" aria-pressed={synonyms && !whole} disabled={whole} aria-label={t('Synonyms with AI')} title={synonyms ? (researchModel ? t('Synonyms with AI: on, with the research model {model} (it only sees the searched words)', { model: researchModel.model }) : t('Synonyms with AI: on (the AI model only sees the searched words)')) : t('Synonyms with AI: off')} className={`shrink-0 transition disabled:opacity-40 ${synonyms && !whole ? 'text-accent-400' : 'text-slate-500 hover:text-slate-200'}`} onClick={toggleSynonyms}><Sparkles size={15} /></button>
          {query && <button type="button" aria-label={t('Clear')} title={t('Clear')} className="shrink-0 text-slate-500 transition hover:text-slate-100" onClick={() => { setQuery(''); input.current?.focus() }}><X size={14} /></button>}
        </label>
        </div>
        <button type="button" aria-label={t('Refresh')} title={t('Refresh')} disabled={loading} className="pointer-events-auto rounded-lg border border-slate-700 bg-slate-900/90 p-2.5 text-slate-400 shadow-lg backdrop-blur transition hover:text-accent-400 disabled:opacity-50" onClick={() => { memory.done = null; load({ refresh: true }); setRerun((value) => value + 1) }}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      {/* Solo il grafo ha i colori fissi (sfondo grigio scuro, `.home-dark`); ricerca e risultati seguono il tema dell'app. */}
      <div className="home-dark relative flex min-h-0 flex-1 flex-col">
        {error && <p className="px-4 pt-16 text-xs text-rose-400">{error}</p>}
        {graph && nodes.some((node) => !node.missing) && <ProjectGraph graph={graph} matches={matches} activePath={active} layoutVersion={layoutVersion} onOpen={onOpenProject} onContext={openProjectMenu} />}
        {!graph && loading && <div className="flex flex-1 items-center justify-center text-slate-500"><Loader2 className="animate-spin" size={20} aria-label={t('Loading…')} /></div>}

        {/* Una nota in basso solo quando c'è qualcosa da sapere: le connessioni sono approssimate, mancano testi, o nessun progetto condivide. Nel caso normale non c'è nulla da dire. */}
        {graph && (() => {
          const hint = sharing > 1
            ? (graph.approximate ? t('Connections are approximate: the meaning model is not available.') : graph.semantic ? null : t('Not enough indexed text to connect the projects yet.'))
            : t('Connect projects by turning on knowledge sharing in their settings.')
          return hint && <p className="pointer-events-none absolute bottom-3 right-3 max-w-[60%] truncate text-right text-[11px] text-slate-600">{hint}</p>
        })()}
      </div>

      {showPanel && (
        <div style={{ width: panelWidth }} className="absolute bottom-3 right-3 top-3 z-10 max-w-[calc(100%-1.5rem)]" role="region" aria-label={t('Search results')} aria-live="polite">
          <PanelResizer side="right" label={t('Search results width')} width={panelWidth} min={RESULTS_PANEL.min} max={maxWidth} defaultWidth={Math.min(RESULTS_PANEL.default, maxWidth)} onChange={resizePanel} onCommit={() => saveResultsWidth(widthRef.current)} />
          <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900/95 shadow-2xl backdrop-blur">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 px-3 py-2 text-xs text-slate-400">
            <span className="truncate">
              {search.state === 'loading' && !search.results.length ? t('Searching…') : search.state === 'error' ? t('Search failed') : tp(visibleResults.length, { one: '{count} passage in {projects} projects', other: '{count} passages in {projects} projects' }, { count: visibleResults.length, projects: groups.length })}
            </span>
            <button type="button" aria-label={t('Close')} title={t('Close')} className="shrink-0 text-slate-500 transition hover:text-slate-100" onClick={() => setQuery('')}><X size={14} /></button>
          </div>
          <div ref={scrollRef} onScroll={(event) => { memory.scrollTop = event.currentTarget.scrollTop }} className="min-h-0 flex-1 overflow-y-auto">
            {synonyms && search.state === 'done' && search.localTerms?.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-800/70 px-3 py-2 text-[11px] leading-4 text-slate-500">
                <span>{t('Also searched in your texts:')}</span>{search.localTerms.map((term) => <span key={term} className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">{term}</span>)}
              </div>
            )}
            {synonyms && expansion.state !== 'idle' && (
              <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-800/70 px-3 py-2 text-[11px] leading-4 text-slate-500" aria-live="polite">
                {(expansion.state === 'loading' || expansion.state === 'searching') && <><Loader2 size={11} className="animate-spin" /> {expansion.state === 'loading' ? t('Asking the AI for synonyms…') : t('Searching the synonyms…')}</>}
                {expansion.state === 'off' && t('The AI assistant is off: only the synonyms found in your texts are used. Turn it on in the settings for more.')}
                {expansion.state === 'failed' && <span className="text-amber-500">{t('Synonyms not available: {message}', { message: expansion.error })}</span>}
                {expansion.state === 'done' && !expansion.terms.length && t('The AI found no synonyms for this search.')}
                {expansion.terms.length > 0 && <><span>{t('Also searched:')}</span>{expansion.terms.map((term) => <span key={term} className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">{term}</span>)}</>}
              </div>
            )}
            {search.state === 'error' && <p className="p-3 text-xs text-rose-400">{search.error}</p>}
            {search.state === 'done' && search.partial && groups.length > 0 && <p className="border-b border-slate-800/70 px-3 py-2 text-[11px] leading-4 text-slate-500">{t('No passage contains all the words: these contain some of them.')}</p>}
            {search.state === 'done' && !groups.length && <p className="p-3 text-xs text-slate-500">{t('No relevant results')}</p>}
            {search.state === 'done' && !groups.length && canRevealWeak && revealButton}
            {groups.map((group) => (
              <div key={group.path} className="border-b border-slate-800/70 last:border-b-0">
                <button type="button" title={group.path} className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-slate-800/70" onClick={() => onOpenProject(group.path)}>
                  <ProjectAvatar directory={group.path} name={group.name} active={known.has(group.path) && group.path === active} size={26} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-100">{group.name}</span>
                  {known.get(group.path) && !known.get(group.path).shared && <span className="shrink-0 rounded border border-slate-700 px-1.5 text-[10px] text-slate-500" title={t('This project does not share its knowledge with the others: its passages appear only in your own searches')}>{t('Not shared')}</span>}
                  <span className="shrink-0 rounded bg-slate-800 px-1.5 text-[11px] text-slate-400">{group.hits.length}</span>
                </button>
                <ul>
                  {group.hits.map((hit, position) => (
                    <li key={`${hit.absolute}:${hit.startLine}:${position}`}>
                      <button type="button" className="block w-full px-3 py-1.5 pl-[3.1rem] text-left transition hover:bg-slate-800/70" onClick={() => onOpenResult(hit)}>
                        <span className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-xs text-accent-300">{hit.file}<span className="text-slate-500">:{hit.startLine}</span></span>
                          {hit.relevance !== undefined && <Relevance value={hit.relevance} z={hit.z} />}
                        </span>
                        {hit.heading && <span className="block truncate text-[11px] text-slate-500"><Snippet text={hit.heading} /></span>}
                        {hit.term && hit.term.toLowerCase() !== search.query.toLowerCase() && <span className="mr-1 mt-0.5 inline-block rounded bg-accent-500/15 px-1.5 text-[10px] text-accent-300" title={t('Found through a synonym of your search')}>{t('via')} {hit.term}</span>}
                        {hit.weak && <span className="mr-1 mt-0.5 inline-block rounded border border-slate-700 px-1.5 text-[10px] text-slate-500" title={t('Below the relevance threshold: shown because you asked for it')}>{t('Less relevant')}</span>}
                        {hit.via === 'meaning' && <span className="mt-0.5 inline-block rounded bg-slate-800 px-1.5 text-[10px] uppercase tracking-wide text-slate-400" title={t('It does not contain the words: it is close in meaning')}>{t('By meaning')}</span>}
                        <span className="mt-0.5 line-clamp-3 block break-words text-xs leading-5 text-slate-400"><Snippet text={hit.snippet} /></span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {groups.length > 0 && canRevealWeak && <div className="border-t border-slate-800/70">{revealButton}</div>}
            {showWeak && weakShown > 0 && (
              <div className="flex items-center justify-between gap-2 border-t border-slate-800/70 px-3 py-2 text-[11px] text-slate-500">
                <span>{t('Less relevant passages are shown too, ordered by relevance.')}</span>
                <button type="button" className="shrink-0 text-slate-400 transition hover:text-accent-400" onClick={() => setShowWeak(false)}>{t('Hide')}</button>
              </div>
            )}
          </div>
          </div>
        </div>
      )}
      {settingsFor && (
        <ProjectSettingsDialog
          title={settingsFor.name}
          path={settingsFor.path}
          onClose={() => setSettingsFor(null)}
          onMove={onMove ? async (directory) => { const moved = await onMove(directory); if (moved) { setSettingsFor(null); load({ silent: true }) } return moved } : undefined}
          onEditContext={project && samePath(settingsFor.path, project) && onOpenFile ? (file) => { setSettingsFor(null); onOpenFile(file) } : undefined}
          onChanged={() => { load({ silent: true }); if (project && samePath(settingsFor.path, project)) onSettingsChanged?.() }}
        />
      )}
    </section>
  )
}
