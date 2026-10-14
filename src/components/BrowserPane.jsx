import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, FileDown, Loader2, Minus, Moon, Plus, RotateCw, Sun } from 'lucide-react'
import { articleFileName, articleToMarkdown, extractArticle, readerDocument } from '../lib/readerMode.js'
import { t } from '../i18n/index.js'

const SETTLE_MS = 700
const NAVIGATION_TIMEOUT_MS = 25000
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

// Indirizzo digitato: URL completo, dominio senza protocollo oppure ricerca.
function toAddress(input) {
  const value = input.trim()
  if (/^https?:\/\//i.test(value)) return value
  if (/^[^\s]+\.[^\s]{2,}$/.test(value)) return `https://${value}`
  return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(value)}`
}

// Scheda browser basata su <webview> isolato. Registra un controller con cui l'assistente può navigare e leggere la pagina.
export default function BrowserPane({ tab, active, onRegister, onTitle, onSaved, onStatus }) {
  const viewRef = useRef(null)
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState({ back: false, forward: false })
  // Vista lettura: l'articolo estratto dalla pagina (null = pagina normale), con tema e dimensione del testo.
  const [reader, setReader] = useState(null)
  const [readerDark, setReaderDark] = useState(true)
  const [readerSize, setReaderSize] = useState(18)
  const [readerBusy, setReaderBusy] = useState(false)

  useEffect(() => {
    const view = viewRef.current
    let domReady = false
    const whenReady = () => (domReady ? Promise.resolve() : new Promise((resolve) => view.addEventListener('dom-ready', resolve, { once: true })))

    const syncHistory = () => {
      if (!domReady) return
      setHistory({ back: view.canGoBack(), forward: view.canGoForward() })
    }
    const onDomReady = () => { domReady = true }
    const onNavigate = (event) => { setAddress(event.url); syncHistory() }
    // Cambiando pagina si esce dalla vista lettura (non per i cambi interni di una stessa pagina).
    const onPageChange = () => setReader(null)
    const onTitleUpdated = (event) => onTitle(tab.id, event.title)
    const onStart = () => setLoading(true)
    const onStop = () => { setLoading(false); syncHistory() }

    view.addEventListener('dom-ready', onDomReady)
    view.addEventListener('did-navigate', onNavigate)
    view.addEventListener('did-navigate', onPageChange)
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
      async navigate(target) {
        await whenReady()
        await settle(() => view.loadURL(target).catch(() => {}))
      },
      async back() { await whenReady(); if (!view.canGoBack()) throw new Error(t('There is no previous page')); await settle(() => view.goBack()) },
      async forward() { await whenReady(); if (!view.canGoForward()) throw new Error(t('There is no next page')); await settle(() => view.goForward()) },
      async reload() { await whenReady(); await settle(() => view.reload()) },
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
      view.removeEventListener('did-navigate-in-page', onNavigate)
      view.removeEventListener('page-title-updated', onTitleUpdated)
      view.removeEventListener('did-start-loading', onStart)
      view.removeEventListener('did-stop-loading', onStop)
    }
  }, [tab.id, onRegister, onTitle])

  function submit(event) {
    event.preventDefault()
    if (address.trim()) viewRef.current.loadURL(toAddress(address)).catch(() => {})
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

  const buttonClass = 'rounded p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-50 disabled:opacity-30 disabled:hover:bg-transparent'

  // Se non è la scheda attiva il <webview> resta renderizzato fuori schermo, così l'assistente può continuare a usarlo.
  return (
    <div className={active ? 'flex min-h-0 flex-1 flex-col' : 'pointer-events-none fixed left-[-12000px] top-0 flex h-[720px] w-[1100px] flex-col'}>
      <form className="flex items-center gap-1 border-b border-slate-800 bg-slate-950/40 p-2" onSubmit={submit}>
        <button type="button" aria-label={t('Back')} disabled={!history.back} className={buttonClass} onClick={() => viewRef.current.goBack()}><ArrowLeft size={16} /></button>
        <button type="button" aria-label={t('Forward')} disabled={!history.forward} className={buttonClass} onClick={() => viewRef.current.goForward()}><ArrowRight size={16} /></button>
        <button type="button" aria-label={t('Reload')} className={buttonClass} onClick={() => viewRef.current.reload()}>{loading ? <Loader2 size={16} className="animate-spin" /> : <RotateCw size={16} />}</button>
        <input
          value={address}
          aria-label={t('Address')}
          placeholder={t('Search or type an address')}
          className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-accent-400"
          onChange={(event) => setAddress(event.target.value)}
          onFocus={(event) => event.target.select()}
        />
        <button type="button" aria-label={reader ? t('Exit reading view') : t('Reading view')} title={reader ? t('Exit reading view') : t('Reading view')} aria-pressed={Boolean(reader)} disabled={readerBusy} className={`${buttonClass} ${reader ? 'bg-slate-800 text-accent-400' : ''}`} onClick={toggleReader}>{readerBusy ? <Loader2 size={16} className="animate-spin" /> : <BookOpen size={16} />}</button>
        {reader && (
          <>
            <button type="button" aria-label={t('Smaller text')} title={t('Smaller text')} disabled={readerSize <= 14} className={buttonClass} onClick={() => setReaderSize((value) => value - 2)}><Minus size={16} /></button>
            <button type="button" aria-label={t('Larger text')} title={t('Larger text')} disabled={readerSize >= 28} className={buttonClass} onClick={() => setReaderSize((value) => value + 2)}><Plus size={16} /></button>
            <button type="button" aria-label={t('Switch light/dark')} title={t('Switch light/dark')} className={buttonClass} onClick={() => setReaderDark((value) => !value)}>{readerDark ? <Sun size={16} /> : <Moon size={16} />}</button>
            <button type="button" aria-label={t('Save as Markdown')} title={t('Save as Markdown')} className={buttonClass} onClick={saveReader}><FileDown size={16} /></button>
          </>
        )}
      </form>
      {reader && <iframe title={t('Reading view')} sandbox="" srcDoc={readerDocument(reader, { dark: readerDark, size: readerSize })} className="min-h-0 flex-1 border-0" />}
      <webview ref={viewRef} partition="persist:openwriter-browser" src="about:blank" className={`min-h-0 flex-1 bg-white ${reader ? 'hidden' : ''}`} />
    </div>
  )
}
