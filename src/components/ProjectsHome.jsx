import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, RefreshCw, Search, Sparkles, X } from 'lucide-react'
import ProjectGraph from './ProjectGraph.jsx'
import PanelResizer from './PanelResizer.jsx'
import { ProjectAvatar } from './ProjectIcon.jsx'
import { samePath } from '../lib/pathCompare.js'
import { RESULTS_PANEL, loadResultsWidth, saveResultsWidth } from '../lib/layout.js'
import { expansionMessages, parseExpansion } from '../lib/queryExpansion.js'
import { getPreference, setPreference } from '../lib/preferences.js'
import { createSynonymCache, synonymKey } from '../lib/synonymCache.js'
import { t, tp } from '../i18n/index.js'

const electronAPI = window.electronAPI
const MIN_QUERY = 2
const DEBOUNCE_MS = 450
const SYNONYMS_KEY = 'openwriter.homeSynonyms'
const EXPANSION_TIMEOUT_MS = 15000
// Sinonimi già chiesti al modello: la stessa parola (con lo stesso modello) non si chiede due volte, nemmeno tra una sessione e l'altra (30 giorni, al più 300 parole).
const synonymCache = createSynonymCache({ read: () => getPreference('openwriter.synonymCache'), write: (text) => setPreference('openwriter.synonymCache', text) })

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

// Le parole trovate arrivano tra « »: si evidenziano.
function Snippet({ text }) {
  const parts = String(text || '').split(/(«[^»]*»)/g)
  return <>{parts.map((part, index) => (part.startsWith('«') && part.endsWith('»') ? <mark key={index} className="rounded bg-accent-500/25 px-0.5 text-slate-50">{part.slice(1, -1)}</mark> : <Fragment key={index}>{part.replace(/[«»]/g, '')}</Fragment>))}</>
}

// Il fattore di pertinenza di un passaggio: una barra e la percentuale. Dice quanto si stacca dagli altri per questa ricerca (e, se contiene le parole, almeno "buono").
function Relevance({ value, z }) {
  const percent = Math.round(Math.max(0, Math.min(1, value)) * 100)
  const title = t('Relevance {percent}%: how much this passage stands out from the others for this search{detail}', { percent, detail: z === undefined ? '' : ` (z ${z})` })
  return (
    <span title={title} aria-label={title} className="flex shrink-0 items-center gap-1.5 text-[10px] tabular-nums text-slate-400">
      <span className="h-1 w-10 overflow-hidden rounded-full bg-slate-700"><span className="block h-full rounded-full bg-accent-400" style={{ width: `${percent}%` }} /></span>
      {percent}%
    </span>
  )
}

/**
 * La Home dei progetti: la rete dei progetti (bolle con le icone, sinapsi tra quelli affini) e, sopra, una ricerca per significato come la farebbe un agente.
 * I risultati compaiono in un pannello sovrapposto; le bolle con risultati si illuminano. `onOpenProject(percorso)`, `onOpenResult(passaggio)`.
 */
export default function ProjectsHome({ project, visible = true, onOpenProject, onOpenResult }) {
  const [graph, setGraph] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState({ state: 'idle', results: [], partial: false, weakCount: 0, error: '', query: '' })
  // "Mostra anche meno pertinenti": i passaggi scartati dal filtro si chiedono una volta (`weakLoaded`) e si mostrano o nascondono qui, senza nuova ricerca.
  const [showWeak, setShowWeak] = useState(false)
  const weakLoaded = useRef(false)
  // Sinonimi con l'IA: acceso di default (si ricorda la scelta); se l'IA non è attiva la ricerca resta quella di prima e lo dice.
  const [synonyms, setSynonyms] = useState(() => getPreference(SYNONYMS_KEY) !== '0')
  const [aiOn, setAiOn] = useState(true)
  const [researchModel, setResearchModel] = useState(null) // { provider, model } se il modello di ricerca è attivo
  const [modelId, setModelId] = useState('') // il modello che risponde per i sinonimi (provider:modello), chiave della cache
  const [rerun, setRerun] = useState(0) // «Aggiorna» rifà anche la ricerca in corso (l'indice può essere cambiato)
  const [expansion, setExpansion] = useState({ state: 'idle', terms: [], error: '' })
  // Il modello di ricerca, se impostato e attivo, funziona anche con l'assistente spento (come per lo strumento `research` della chat).
  useEffect(() => {
    electronAPI.ai?.getSettings?.().then((settings) => {
      const researcher = settings?.researcher?.enabled && settings.researcher.model ? { provider: settings.researcher.provider, model: settings.researcher.model } : null
      setResearchModel(researcher)
      setModelId(researcher ? `${researcher.provider}:${researcher.model}` : `${settings?.provider || ''}:${settings?.providers?.[settings?.provider]?.model || ''}`)
      setAiOn(Boolean(researcher) || Boolean(settings?.aiEnabled))
    }).catch(() => setAiOn(false))
  }, [])
  const toggleSynonyms = () => setSynonyms((current) => { const next = !current; setPreference(SYNONYMS_KEY, next ? '1' : '0'); return next })
  const sequence = useRef(0)
  const input = useRef(null)
  // Pannello dei risultati: ancorato a destra, si allarga verso sinistra; la larghezza scelta si ricorda. Non può superare lo spazio della Home.
  const sectionRef = useRef(null)
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

  // `silent`: riletture in secondo piano (ritorno alla Home, indice che lavora): niente rotellina sul pulsante.
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    setError('')
    try {
      const next = await electronAPI.getProjectGraph()
      // Se nulla è cambiato si tiene il grafo di prima: la rete non si ricompone e le bolle restano dove sono.
      setGraph((current) => (current && JSON.stringify(current) === JSON.stringify(next) ? current : next))
    } catch (reason) { setError(reason.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load, project])
  // La Home resta montata anche nascosta: al ritorno si riallinea (un indice può essere cambiato nel frattempo) e, finché l'indice lavora (scansione o vettori ancora da
  // calcolare), si riguarda ogni pochi secondi: un progetto appena aggiunto si collega da solo quando i suoi vettori sono pronti.
  const busy = Boolean(graph?.busy)
  useEffect(() => { if (visible) load({ silent: true }) }, [visible, load])
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
      setSearch({ state: 'idle', results: [], partial: false, weakCount: 0, error: '', query: '' })
      setExpansion({ state: 'idle', terms: [], error: '' })
      setShowWeak(false)
      weakLoaded.current = false
      return undefined
    }
    const mine = ++sequence.current
    const stale = () => mine !== sequence.current
    const timer = setTimeout(async () => {
      setSearch((current) => ({ ...current, state: 'loading', error: '' }))
      setExpansion({ state: 'idle', terms: [], error: '' })
      setShowWeak(false)
      weakLoaded.current = false
      try {
        const answer = await electronAPI.searchProjects({ query: text, maxResults: 20 })
        if (stale()) return
        setSearch({ state: 'done', results: answer.results, partial: Boolean(answer.partial), weakCount: answer.weakCount || 0, error: '', query: text })
      } catch (reason) {
        if (!stale()) setSearch({ state: 'error', results: [], partial: false, weakCount: 0, error: reason.message, query: text })
        return
      }
      if (!synonyms) return
      if (!aiOn) { setExpansion({ state: 'off', terms: [], error: '' }); return }
      setExpansion({ state: 'loading', terms: [], error: '' })
      try {
        const terms = await expandQuery(text, researchModel, modelId)
        if (stale()) return
        if (!terms.length) { setExpansion({ state: 'done', terms: [], error: '' }); return }
        setExpansion({ state: 'searching', terms, error: '' })
        const answer = await electronAPI.searchProjects({ query: text, terms, maxResults: weakLoaded.current ? 30 : 20, includeWeak: weakLoaded.current })
        if (stale()) return
        setSearch({ state: 'done', results: answer.results, partial: Boolean(answer.partial), weakCount: answer.weakCount || 0, error: '', query: text })
        setExpansion({ state: 'done', terms, error: '' })
      } catch (reason) {
        if (!stale()) setExpansion({ state: 'failed', terms: [], error: reason.message })
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query, synonyms, aiOn, researchModel, modelId, rerun])

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
  const matches = useMemo(() => (search.state === 'done' && groups.length ? new Map(groups.map((group) => [group.path, group.hits.length])) : null), [search.state, groups])

  // Chiede (una volta) anche i passaggi meno pertinenti, poi li mostra. Gli stessi sinonimi già trovati restano nella ricerca.
  const [weakBusy, setWeakBusy] = useState(false)
  async function revealWeak() {
    if (weakLoaded.current) { setShowWeak(true); return }
    setWeakBusy(true)
    try {
      const answer = await electronAPI.searchProjects({ query: search.query, terms: expansion.terms, maxResults: 30, includeWeak: true })
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
    <button type="button" disabled={weakBusy} className="flex w-full items-center justify-center gap-1.5 px-3 py-2 text-xs text-slate-400 transition hover:text-accent-400 disabled:opacity-60" onClick={revealWeak}>
      {weakBusy && <Loader2 size={12} className="animate-spin" />}{t('Show less relevant too')}
    </button>
  )

  const active = nodes.find((node) => project && samePath(node.path, project))?.path || null
  const sharing = nodes.filter((node) => node.shared && node.chunks > 0).length
  const showPanel = query.trim().length >= MIN_QUERY

  return (
    <section ref={sectionRef} className="relative flex min-h-0 flex-1 flex-col bg-slate-950" aria-label={t('Projects home')}>
      {/* Centrata nello spazio libero: con i risultati aperti si sposta per non finirci sotto. */}
      <div style={{ left: 0, right: showPanel ? panelWidth + 12 : 0, marginInline: 'auto' }} className="pointer-events-none absolute top-0 z-10 flex max-w-xl items-start gap-2 px-3 pb-3 pt-5">
        <label className="pointer-events-auto flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/90 px-3 py-2 shadow-lg backdrop-blur focus-within:border-accent-400">
          <Search size={15} className="shrink-0 text-slate-500" />
          <input
            ref={input}
            value={query}
            placeholder={t('Search all your projects by meaning…')}
            aria-label={t('Search all your projects')}
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Escape') { setQuery(''); event.stopPropagation() } }}
          />
          {search.state === 'loading' && <Loader2 size={14} className="shrink-0 animate-spin text-slate-500" aria-label={t('Searching…')} />}
          <button type="button" aria-pressed={synonyms} aria-label={t('Synonyms with AI')} title={synonyms ? (researchModel ? t('Synonyms with AI: on, with the research model {model} (it only sees the searched words)', { model: researchModel.model }) : t('Synonyms with AI: on (the AI model only sees the searched words)')) : t('Synonyms with AI: off')} className={`shrink-0 transition ${synonyms ? 'text-accent-400' : 'text-slate-500 hover:text-slate-200'}`} onClick={toggleSynonyms}><Sparkles size={15} /></button>
          {query && <button type="button" aria-label={t('Clear')} title={t('Clear')} className="shrink-0 text-slate-500 transition hover:text-slate-100" onClick={() => { setQuery(''); input.current?.focus() }}><X size={14} /></button>}
        </label>
        <button type="button" aria-label={t('Refresh')} title={t('Refresh')} disabled={loading} className="pointer-events-auto rounded-lg border border-slate-700 bg-slate-900/90 p-2.5 text-slate-400 shadow-lg backdrop-blur transition hover:text-accent-400 disabled:opacity-50" onClick={() => { load(); setRerun((value) => value + 1) }}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      {/* Solo il grafo ha i colori fissi (sfondo grigio scuro, `.home-dark`); ricerca e risultati seguono il tema dell'app. */}
      <div className="home-dark relative flex min-h-0 flex-1 flex-col">
        {error && <p className="px-4 pt-16 text-xs text-rose-400">{error}</p>}
        {!error && graph && !nodes.some((node) => !node.missing) && <p className="px-4 pt-16 text-sm text-slate-500">{t('No projects yet. Create one or open an existing folder.')}</p>}
        {graph && nodes.some((node) => !node.missing) && <ProjectGraph graph={graph} matches={matches} activePath={active} onOpen={onOpenProject} />}
        {!graph && loading && <div className="flex flex-1 items-center justify-center text-slate-500"><Loader2 className="animate-spin" size={20} aria-label={t('Loading…')} /></div>}

        {graph && (
          <p className="pointer-events-none absolute bottom-3 right-3 max-w-[60%] truncate text-right text-[11px] text-slate-600">
            {sharing > 1
              ? (graph.approximate ? t('Connections are approximate: the meaning model is not available.') : graph.semantic ? t('Lines join the projects closest in meaning.') : t('Not enough indexed text to connect the projects yet.'))
              : t('Connect projects by turning on knowledge sharing in their settings.')}
          </p>
        )}
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
          <div className="min-h-0 flex-1 overflow-y-auto">
            {synonyms && expansion.state !== 'idle' && (
              <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-800/70 px-3 py-2 text-[11px] leading-4 text-slate-500" aria-live="polite">
                {(expansion.state === 'loading' || expansion.state === 'searching') && <><Loader2 size={11} className="animate-spin" /> {expansion.state === 'loading' ? t('Asking the AI for synonyms…') : t('Searching the synonyms…')}</>}
                {expansion.state === 'off' && t('Synonyms need the AI assistant: turn it on in the settings.')}
                {expansion.state === 'failed' && <span className="text-amber-500">{t('Synonyms not available: {message}', { message: expansion.error })}</span>}
                {expansion.state === 'done' && !expansion.terms.length && t('The AI found no synonyms for this search.')}
                {expansion.terms.length > 0 && <><span>{t('Also searched:')}</span>{expansion.terms.map((term) => <span key={term} className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">{term}</span>)}</>}
              </div>
            )}
            {search.state === 'error' && <p className="p-3 text-xs text-rose-400">{search.error}</p>}
            {search.state === 'done' && search.partial && groups.length > 0 && <p className="border-b border-slate-800/70 px-3 py-2 text-[11px] leading-4 text-slate-500">{t('No passage contains all the words: these contain some of them.')}</p>}
            {search.state === 'done' && !groups.length && <p className="p-3 text-xs text-slate-500">{t('Nothing relevant found. Only projects that share their knowledge and have an index are searched.')}</p>}
            {search.state === 'done' && !groups.length && canRevealWeak && revealButton}
            {groups.map((group) => (
              <div key={group.path} className="border-b border-slate-800/70 last:border-b-0">
                <button type="button" title={group.path} className="flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-slate-800/70" onClick={() => onOpenProject(group.path)}>
                  <ProjectAvatar directory={group.path} name={group.name} active={known.has(group.path) && group.path === active} size={26} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-100">{group.name}</span>
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
                        {hit.heading && <span className="block truncate text-[11px] text-slate-500">{hit.heading}</span>}
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
    </section>
  )
}
