import { useEffect, useMemo, useRef, useState } from 'react'
import { subscribeAppearance } from '../appearance.js'
import { ArrowLeft, ArrowRight, BookOpen, Camera, Clock, Crop, ExternalLink, FileDown, Loader2, Minus, Moon, Plus, RotateCw, Star, Sun, X } from 'lucide-react'
import { articleFileName, articleToMarkdown, extractArticle, readerDocument } from '../lib/readerMode.js'
import { saveFromController } from '../lib/webReferences.js'
import { isPrivateHost } from '../lib/webAddress.js'
import { t } from '../i18n/index.js'

const SETTLE_MS = 700
const NAVIGATION_TIMEOUT_MS = 25000
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })
// Una pagina web (http o https) di una rete locale o privata; about:blank e simili no.
const isPrivateUrl = (value) => { try { const url = new URL(value); return /^https?:$/.test(url.protocol) && isPrivateHost(url.hostname) } catch { return false } }

// Indirizzo digitato: URL completo, dominio senza protocollo oppure ricerca.
function toAddress(input) {
  const value = input.trim()
  if (/^https?:\/\//i.test(value)) return value
  if (/^[^\s]+\.[^\s]{2,}$/.test(value)) return `https://${value}`
  return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(value)}`
}

// Proposte della barra degli indirizzi: le pagine della cronologia del progetto che corrispondono a quanto si scrive (indirizzo o titolo).
// I clic non tolgono il focus al campo (onMouseDown), così le frecce e Invio continuano a funzionare.
const MAX_SUGGESTIONS = 8

function rankSuggestions(entries, query) {
  const needle = query.trim().toLowerCase()
  if (!needle) return entries.slice(0, MAX_SUGGESTIONS)
  const score = (entry) => {
    const full = entry.url.toLowerCase()
    const url = full.replace(/^https?:\/\/(www\.)?/, '')
    if (url.startsWith(needle) || full.startsWith(needle)) return 0
    if (full.includes(needle)) return 1
    return String(entry.title || '').toLowerCase().includes(needle) ? 2 : 3
  }
  return entries.map((entry, index) => ({ entry, index, rank: score(entry) })).filter((item) => item.rank < 3).sort((left, right) => left.rank - right.rank || left.index - right.index).slice(0, MAX_SUGGESTIONS).map((item) => item.entry)
}

function Suggestions({ items, highlight, hasQuery, hasHistory, onPick, onRemove, onClear }) {
  return (
    <div role="listbox" aria-label={t('History')} className="absolute left-2 right-2 top-full z-20 mt-1 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 py-1 shadow-xl" onMouseDown={(event) => event.preventDefault()}>
      {items.map((entry, index) => (
        <div key={entry.url} role="option" aria-selected={index === highlight} className={`group flex items-center gap-1 ${index === highlight ? 'bg-slate-700' : 'hover:bg-slate-800'}`}>
          <button type="button" tabIndex={-1} title={entry.url} className="min-w-0 flex-1 px-3 py-1.5 text-left" onClick={() => onPick(entry.url)}>
            <span className="block truncate text-sm text-slate-100">{entry.title || entry.url}</span>
            <span className="block truncate text-xs text-slate-500">{entry.url}</span>
          </button>
          <button type="button" tabIndex={-1} aria-label={t('Remove from history')} title={t('Remove from history')} className="mr-1 rounded p-1 text-slate-500 opacity-0 transition hover:text-slate-50 group-hover:opacity-100" onClick={() => onRemove(entry.url)}><X size={13} /></button>
        </div>
      ))}
      {!items.length && <p className="px-3 py-2 text-xs text-slate-500">{hasHistory ? t('No matching pages') : t('No pages visited yet in this project')}</p>}
      {!hasQuery && hasHistory && <button type="button" tabIndex={-1} className="mx-2 mt-1 rounded px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-50" onClick={onClear}>{t('Clear history')}</button>}
    </div>
  )
}

// Scheda browser basata su <webview> isolato. Registra un controller con cui l'assistente può navigare e leggere la pagina.
export default function BrowserPane({ tab, active, onRegister, onTitle, onSaved, onScreenshot, onRegion, onStatus, webRefsVersion = 0, onWebRefsChanged }) {
  const viewRef = useRef(null)
  // Una scheda ripristinata dopo un riavvio si apre alla pagina in cui era.
  const initialUrl = useRef(tab.initialUrl || 'about:blank')
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState({ back: false, forward: false })
  // Vista lettura: l'articolo estratto dalla pagina (null = pagina normale), con tema e dimensione del testo.
  const [reader, setReader] = useState(null)
  // Tema della vista lettura: segue quello dell'app (chiaro/scuro/sistema) finché non lo si cambia a mano con il pulsante, per questa scheda.
  const [readerDarkChoice, setReaderDarkChoice] = useState(null)
  const [, setThemeTick] = useState(0)
  const schemeRef = useRef(null)
  useEffect(() => {
    const refresh = () => { setThemeTick((value) => value + 1); schemeRef.current?.() }
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    query.addEventListener('change', refresh)
    const unsubscribe = subscribeAppearance(refresh)
    return () => { query.removeEventListener('change', refresh); unsubscribe() }
  }, [])
  const readerDark = readerDarkChoice ?? document.documentElement.dataset.theme !== 'light'
  const [readerSize, setReaderSize] = useState(18)
  const [readerBusy, setReaderBusy] = useState(false)
  // Barra degli indirizzi con proposte dalla cronologia: `query` è ciò che si è digitato; `highlight` la proposta scelta con le frecce (-1 = nessuna).
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [historyEntries, setHistoryEntries] = useState([])
  const [highlight, setHighlight] = useState(-1)
  const inputRef = useRef(null)
  const suggestions = useMemo(() => rankSuggestions(historyEntries, query), [historyEntries, query])
  const shownAddress = suggestOpen && suggestions[highlight] ? suggestions[highlight].url : address

  useEffect(() => {
    const view = viewRef.current
    let domReady = false
    const whenReady = () => (domReady ? Promise.resolve() : new Promise((resolve) => view.addEventListener('dom-ready', resolve, { once: true })))

    const syncHistory = () => {
      if (!domReady) return
      setHistory({ back: view.canGoBack(), forward: view.canGoForward() })
    }
    // La pagina dichiara lo stesso tema dell'app (chiaro/scuro), non quello del sistema: altrimenti con l'app chiara e il sistema scuro si leggerebbe testo bianco su bianco.
    const applyScheme = () => {
      if (!domReady) return
      window.electronAPI.setBrowserColorScheme?.({ contentsId: view.getWebContentsId(), dark: document.documentElement.dataset.theme !== 'light' }).catch(() => {})
    }
    schemeRef.current = applyScheme
    const onDomReady = () => { domReady = true; applyScheme() }
    // Cronologia del progetto: le pagine http(s) visitate (non i cambi interni di una stessa pagina); il titolo arriva dopo.
    // Le navigazioni comandate dall'assistente (controller qui sotto) vanno nella sua cronologia, a parte; il resto è dell'utente.
    let agentActive = 0
    let agentUntil = 0
    // Durante una navigazione dell'assistente il processo principale impedisce di arrivare alla rete locale o privata (anche per reindirizzamento o DNS);
    // se la scheda ci è comunque finita (script della pagina), viene svuotata e l'azione fallisce.
    const guard = (on) => window.electronAPI?.guardAgentBrowser?.({ contentsId: view.getWebContentsId(), on }).catch(() => {})
    const byAgent = async (action) => {
      agentActive += 1
      await whenReady()
      await guard(true)
      try {
        const result = await action()
        if (isPrivateUrl(view.getURL())) { view.loadURL('about:blank').catch(() => {}); throw new Error('Local and private-network addresses are not allowed') }
        return result
      } finally { await guard(false); agentActive -= 1; agentUntil = Date.now() + SETTLE_MS + 1000 }
    }
    const remember = (url, title) => { if (/^https?:/i.test(url)) window.electronAPI?.browserHistory?.add({ url, title, agent: agentActive > 0 || Date.now() < agentUntil }).catch(() => {}) }
    const onNavigate = (event) => { setAddress(event.url); syncHistory() }
    const onVisited = (event) => remember(event.url, view.getTitle())
    // Cambiando pagina si esce dalla vista lettura (non per i cambi interni di una stessa pagina).
    const onPageChange = () => setReader(null)
    const onTitleUpdated = (event) => { onTitle(tab.id, event.title); if (domReady) remember(view.getURL(), event.title) }
    const onStart = () => setLoading(true)
    const onStop = () => { setLoading(false); syncHistory() }

    view.addEventListener('dom-ready', onDomReady)
    view.addEventListener('did-navigate', onNavigate)
    view.addEventListener('did-navigate', onPageChange)
    view.addEventListener('did-navigate', onVisited)
    view.addEventListener('did-navigate-in-page', onNavigate)
    view.addEventListener('page-title-updated', onTitleUpdated)
    view.addEventListener('did-start-loading', onStart)
    view.addEventListener('did-stop-loading', onStop)

    // Attende la fine del caricamento (con un breve margine per gli script della pagina).
    const settle = (start) => new Promise((resolve) => {
      const done = () => { clearTimeout(timer); view.removeEventListener('did-stop-loading', done); view.removeEventListener('did-fail-load', done); resolve() }
      const timer = setTimeout(done, NAVIGATION_TIMEOUT_MS)
      view.addEventListener('did-stop-loading', done)
      view.addEventListener('did-fail-load', done)
      start()
    }).then(() => sleep(SETTLE_MS))

    onRegister(tab.id, {
      // Apertura chiesta dall'utente (per esempio "Cerca sul web" dal testo selezionato): non conta come navigazione dell'assistente nella cronologia.
      open: async (target) => { await whenReady(); view.loadURL(target).catch(() => {}) },
      navigate: (target) => byAgent(async () => {
        await whenReady()
        await settle(() => view.loadURL(target).catch(() => {}))
      }),
      back: () => byAgent(async () => { await whenReady(); if (!view.canGoBack()) throw new Error(t('There is no previous page')); await settle(() => view.goBack()) }),
      forward: () => byAgent(async () => { await whenReady(); if (!view.canGoForward()) throw new Error(t('There is no next page')); await settle(() => view.goForward()) }),
      reload: () => byAgent(async () => { await whenReady(); await settle(() => view.reload()) }),
      async evaluate(code) {
        await whenReady()
        return view.executeJavaScript(code)
      },
      async webContentsId() {
        await whenReady()
        return view.getWebContentsId()
      },
      // Indirizzo e titolo attuali della scheda (anche se l'utente ha navigato per conto suo).
      info() {
        if (!domReady) return { url: '', title: '' }
        return { url: view.getURL(), title: view.getTitle() }
      },
    })

    return () => {
      onRegister(tab.id, null)
      view.removeEventListener('dom-ready', onDomReady)
      view.removeEventListener('did-navigate', onNavigate)
      view.removeEventListener('did-navigate', onPageChange)
      view.removeEventListener('did-navigate', onVisited)
      view.removeEventListener('did-navigate-in-page', onNavigate)
      view.removeEventListener('page-title-updated', onTitleUpdated)
      view.removeEventListener('did-start-loading', onStart)
      view.removeEventListener('did-stop-loading', onStop)
    }
  }, [tab.id, onRegister, onTitle])

  function openSuggestions(nextQuery = '') {
    setQuery(nextQuery)
    setHighlight(-1)
    setSuggestOpen(true)
    window.electronAPI.browserHistory.list().then(setHistoryEntries).catch(() => setHistoryEntries([]))
  }

  function closeSuggestions() {
    setSuggestOpen(false)
    setHighlight(-1)
  }

  function openUrl(url) {
    closeSuggestions()
    setAddress(url)
    viewRef.current.loadURL(url).catch(() => {})
  }

  function submit(event) {
    event.preventDefault()
    const chosen = suggestOpen ? suggestions[highlight]?.url : null
    if (chosen) { openUrl(chosen); return }
    closeSuggestions()
    if (address.trim()) viewRef.current.loadURL(toAddress(address)).catch(() => {})
  }

  function onAddressKeyDown(event) {
    const count = suggestions.length
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!suggestOpen) { openSuggestions(); return }
      if (!count) return
      setHighlight((current) => (event.key === 'ArrowDown' ? (current + 1 >= count ? -1 : current + 1) : (current - 1 < -1 ? count - 1 : current - 1)))
    } else if (event.key === 'Escape' && suggestOpen) {
      event.preventDefault()
      closeSuggestions()
    }
  }

  async function removeFromHistory(url) {
    setHistoryEntries(await window.electronAPI.browserHistory.remove(url))
  }

  async function clearHistory() {
    setHistoryEntries(await window.electronAPI.browserHistory.clear())
  }

  async function toggleReader() {
    if (reader) { setReader(null); return }
    setReaderBusy(true)
    try {
      const { html, url } = await viewRef.current.executeJavaScript('({ html: document.documentElement.outerHTML, url: location.href })')
      const article = /^https?:/i.test(url) ? extractArticle(html, url) : null
      if (article) setReader(article)
      else onStatus?.(t('No article to show in reading view on this page'))
    } catch (error) {
      console.error(error)
      onStatus?.(t('Could not open the reading view'))
    } finally {
      setReaderBusy(false)
    }
  }

  async function saveReader() {
    try {
      const markdown = articleToMarkdown(reader, { sourceLabel: t('Source') })
      const saved = await window.electronAPI.saveMarkdown({ filePath: null, markdown, saveAs: true, defaultName: articleFileName(reader) })
      if (saved) { onStatus?.(t('Saved as Markdown: {name}', { name: saved.split(/[\\/]/).pop() })); onSaved?.(saved) }
    } catch (error) {
      console.error(error)
      onStatus?.(t('Could not save the article'))
    }
  }

  // Stellina: la pagina è tra i riferimenti web del progetto (copia in Markdown in .ow/web, sempre consultabile dall'assistente)? Cliccandola si aggiunge o si toglie.
  const [savedPage, setSavedPage] = useState(null)
  const [starBusy, setStarBusy] = useState(false)
  const canSave = /^https?:/i.test(address)
  useEffect(() => {
    if (!canSave) { setSavedPage(null); return undefined }
    let cancelled = false
    window.electronAPI.webRefs.find(address).then((entry) => { if (!cancelled) setSavedPage(entry) }).catch(() => { if (!cancelled) setSavedPage(null) })
    return () => { cancelled = true }
  }, [address, canSave, webRefsVersion])

  async function toggleStar() {
    setStarBusy(true)
    try {
      if (savedPage) {
        await window.electronAPI.webRefs.remove(savedPage.id)
        setSavedPage(null)
        onStatus?.(t('Removed from the context'))
      } else {
        const entry = await saveFromController(window.electronAPI, { evaluate: (code) => viewRef.current.executeJavaScript(code) }, { source: 'user' })
        setSavedPage(entry)
        onStatus?.(t('Added to the context: {title}', { title: entry.title }))
      }
      onWebRefsChanged?.()
    } catch (error) {
      console.error(error)
      onStatus?.(error.message)
    } finally {
      setStarBusy(false)
    }
  }

  // Schermata della scheda (la parte visibile della pagina), salvata come PNG nella cartella screenshots del progetto.
  const [shotBusy, setShotBusy] = useState(false)
  async function saveScreenshot() {
    setShotBusy(true)
    try {
      const view = viewRef.current
      const saved = await window.electronAPI.saveBrowserScreenshot({ contentsId: view.getWebContentsId(), title: view.getTitle() })
      onStatus?.(t('Screenshot saved: {name}', { name: `screenshots/${saved.split(/[\\/]/).pop()}` }))
      onScreenshot?.(saved)
    } catch (error) {
      onStatus?.(error.message)
    } finally {
      setShotBusy(false)
    }
  }

  // "Riquadro": si traccia un rettangolo sulla pagina e solo quella parte va all'assistente, come immagine allegata alla chat.
  const [framing, setFraming] = useState(false)
  const [frame, setFrame] = useState(null) // { x0, y0, x1, y1 } in pixel dell'area della pagina
  const [frameBusy, setFrameBusy] = useState(false)
  const frameOverlay = useRef(null)
  useEffect(() => { if (!active || reader) { setFraming(false); setFrame(null) } }, [active, reader])
  useEffect(() => {
    if (!framing) return undefined
    const onKey = (event) => { if (event.key === 'Escape') { setFraming(false); setFrame(null) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [framing])
  const framePoint = (event) => {
    const box = frameOverlay.current.getBoundingClientRect()
    return { x: Math.min(Math.max(event.clientX - box.left, 0), box.width), y: Math.min(Math.max(event.clientY - box.top, 0), box.height) }
  }
  async function finishFrame(box) {
    const area = frameOverlay.current?.getBoundingClientRect()
    setFrame(null)
    setFraming(false)
    const rect = { x: Math.min(box.x0, box.x1), y: Math.min(box.y0, box.y1), width: Math.abs(box.x1 - box.x0), height: Math.abs(box.y1 - box.y0) }
    if (!area || rect.width < 8 || rect.height < 8) { onStatus?.(t('The frame is too small: drag over the part of the page to send')); return }
    setFrameBusy(true)
    try {
      const view = viewRef.current
      const shot = await window.electronAPI.captureWebview(view.getWebContentsId(), { rect, viewport: { width: area.width, height: area.height } })
      onRegion?.({ ...shot, title: view.getTitle() || view.getURL() })
    } catch (error) {
      console.error(error)
      onStatus?.(error.message || t('The operation failed'))
    } finally {
      setFrameBusy(false)
    }
  }

  const buttonClass = 'rounded p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-50 disabled:opacity-30 disabled:hover:bg-transparent'

  // Se non è la scheda attiva il <webview> resta renderizzato fuori schermo, così l'assistente può continuare a usarlo.
  return (
    <div className={active ? 'flex min-h-0 flex-1 flex-col' : 'pointer-events-none fixed left-[-12000px] top-0 flex h-[720px] w-[1100px] flex-col'}>
      <form className="relative flex items-center gap-1 border-b border-slate-800 bg-slate-950/40 p-2" onSubmit={submit}>
        <button type="button" aria-label={t('Back')} disabled={!history.back} className={buttonClass} onClick={() => viewRef.current.goBack()}><ArrowLeft size={16} /></button>
        <button type="button" aria-label={t('Forward')} disabled={!history.forward} className={buttonClass} onClick={() => viewRef.current.goForward()}><ArrowRight size={16} /></button>
        <button type="button" aria-label={t('Reload')} className={buttonClass} onClick={() => viewRef.current.reload()}>{loading ? <Loader2 size={16} className="animate-spin" /> : <RotateCw size={16} />}</button>
        <input
          ref={inputRef}
          value={shownAddress}
          aria-label={t('Address')}
          role="combobox"
          aria-expanded={suggestOpen}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          placeholder={t('Search or type an address')}
          className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-accent-400"
          onChange={(event) => { setAddress(event.target.value); if (suggestOpen) { setQuery(event.target.value); setHighlight(-1) } else openSuggestions(event.target.value) }}
          onFocus={(event) => { event.target.select(); openSuggestions() }}
          onBlur={closeSuggestions}
          onKeyDown={onAddressKeyDown}
        />
        <button type="button" aria-label={t('History')} title={t('History')} aria-expanded={suggestOpen} className={`${buttonClass} ${suggestOpen ? 'bg-slate-800 text-accent-400' : ''}`} onMouseDown={(event) => event.preventDefault()} onClick={() => { if (suggestOpen) { closeSuggestions(); inputRef.current?.blur() } else { inputRef.current?.focus() } }}><Clock size={16} /></button>
        <button type="button" aria-label={t('Open in the system browser')} title={t('Open in the system browser')} className={buttonClass} onClick={() => { const url = viewRef.current?.getURL?.(); if (/^https?:\/\//i.test(url || '')) window.electronAPI.openLink(url) }}><ExternalLink size={16} /></button>
        <button type="button" aria-label={t('Save a screenshot')} title={t('Save a screenshot')} disabled={shotBusy || Boolean(reader)} className={buttonClass} onClick={saveScreenshot}>{shotBusy ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}</button>
        <button type="button" aria-label={t('Frame a region for the assistant')} title={t('Frame a region for the assistant')} aria-pressed={framing} disabled={frameBusy || Boolean(reader) || !onRegion} className={`${buttonClass} ${framing ? 'bg-slate-800 text-accent-400' : ''}`} onClick={() => { setFrame(null); setFraming((value) => !value) }}>{frameBusy ? <Loader2 size={16} className="animate-spin" /> : <Crop size={16} />}</button>
        <button type="button" aria-label={savedPage ? t('Remove from the context') : t('Add to the context')} title={savedPage ? t('Remove from the context') : t('Add to the context')} aria-pressed={Boolean(savedPage)} disabled={!canSave || starBusy} className={`${buttonClass} ${savedPage ? 'text-amber-400 hover:text-amber-300' : ''}`} onClick={toggleStar}>{starBusy ? <Loader2 size={16} className="animate-spin" /> : <Star size={16} className={savedPage ? 'fill-amber-400' : ''} />}</button>
        <button type="button" aria-label={reader ? t('Exit reading view') : t('Reading view')} title={reader ? t('Exit reading view') : t('Reading view')} aria-pressed={Boolean(reader)} disabled={readerBusy} className={`${buttonClass} ${reader ? 'bg-slate-800 text-accent-400' : ''}`} onClick={toggleReader}>{readerBusy ? <Loader2 size={16} className="animate-spin" /> : <BookOpen size={16} />}</button>
        {reader && (
          <>
            <button type="button" aria-label={t('Smaller text')} title={t('Smaller text')} disabled={readerSize <= 14} className={buttonClass} onClick={() => setReaderSize((value) => value - 2)}><Minus size={16} /></button>
            <button type="button" aria-label={t('Larger text')} title={t('Larger text')} disabled={readerSize >= 28} className={buttonClass} onClick={() => setReaderSize((value) => value + 2)}><Plus size={16} /></button>
            <button type="button" aria-label={t('Switch light/dark')} title={t('Switch light/dark')} className={buttonClass} onClick={() => setReaderDarkChoice(!readerDark)}>{readerDark ? <Sun size={16} /> : <Moon size={16} />}</button>
            <button type="button" aria-label={t('Save as Markdown')} title={t('Save as Markdown')} className={buttonClass} onClick={saveReader}><FileDown size={16} /></button>
          </>
        )}
        {suggestOpen && <Suggestions items={suggestions} highlight={highlight} hasQuery={Boolean(query.trim())} hasHistory={historyEntries.length > 0} onPick={openUrl} onRemove={removeFromHistory} onClear={clearHistory} />}
      </form>
      {reader && <iframe title={t('Reading view')} sandbox="" srcDoc={readerDocument(reader, { dark: readerDark, size: readerSize })} className="min-h-0 flex-1 border-0" />}
      <div className={`relative min-h-0 flex-1 ${reader ? 'hidden' : 'flex'}`}>
        <webview ref={viewRef} partition="persist:openwriter-browser" src={initialUrl.current} className="min-h-0 flex-1 bg-white" />
        {framing && (
          <div
            ref={frameOverlay}
            role="presentation"
            className="absolute inset-0 z-10 cursor-crosshair touch-none select-none bg-slate-950/20"
            onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); const point = framePoint(event); setFrame({ x0: point.x, y0: point.y, x1: point.x, y1: point.y }) }}
            onPointerMove={(event) => { if (frame) { const point = framePoint(event); setFrame({ ...frame, x1: point.x, y1: point.y }) } }}
            onPointerUp={(event) => { if (frame) { const point = framePoint(event); finishFrame({ ...frame, x1: point.x, y1: point.y }) } }}
          >
            {!frame && <span className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md bg-slate-900/90 px-3 py-1.5 text-xs text-slate-200 shadow">{t('Drag to frame a region · Esc to cancel')}</span>}
            {frame && (
              <div
                className="pointer-events-none absolute border-2 border-accent-400"
                style={{ left: Math.min(frame.x0, frame.x1), top: Math.min(frame.y0, frame.y1), width: Math.abs(frame.x1 - frame.x0), height: Math.abs(frame.y1 - frame.y0), boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.45)' }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
