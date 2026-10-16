import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, FolderSearch, Maximize2, Minimize2, ZoomIn, ZoomOut } from 'lucide-react'
import { dirname, imageFileUrl, isImageFile } from '../lib/imagePaths.js'
import { formatDateTime, t } from '../i18n/index.js'

const electronAPI = window.electronAPI

const formatSize = (bytes) => {
  if (!Number.isFinite(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const MIN_SCALE = 0.02
const MAX_SCALE = 40
const PADDING = 16
const clampScale = (value) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))

/**
 * Scheda di visualizzazione di un'immagine del progetto, di sola lettura: la rotella ingrandisce e rimpicciolisce attorno al puntatore, il trascinamento
 * con il tasto sinistro sposta l'immagine, il doppio clic alterna "adatta alla finestra" e "grandezza reale". Sotto la barra: dimensioni in pixel,
 * peso e data del file. Come la scheda del browser non ha un editor; l'assistente la vede con `view_image` (percorso dell'immagine).
 */
export default function ImagePane({ tab, active, onStatus, onInteract, onNavigate }) {
  const [size, setSize] = useState(null)
  const [info, setInfo] = useState(null)
  const [failed, setFailed] = useState(false)
  // `fit`: l'immagine segue la finestra (anche quando si ridimensiona); appena si ingrandisce o sposta passa a `free`.
  const [fit, setFit] = useState(true)
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const stage = useRef(null)
  const state = useRef({ view, size, fit })
  state.current = { view, size, fit }
  const drag = useRef(null)
  const [dragging, setDragging] = useState(false)
  const root = useRef(null)

  // Le altre immagini della stessa cartella, nell'ordine dell'albero dei file: con le frecce (o i pulsanti ai lati) si passa dall'una all'altra in questa scheda.
  const [siblings, setSiblings] = useState([])
  useEffect(() => {
    let cancelled = false
    electronAPI.listDirectory(dirname(tab.imagePath))
      .then((entries) => { if (!cancelled) setSiblings((entries || []).filter((entry) => !entry.isDirectory && isImageFile(entry.name)).map((entry) => entry.path)) })
      .catch(() => { if (!cancelled) setSiblings([]) })
    return () => { cancelled = true }
  }, [tab.imagePath])
  const sameFile = (left, right) => String(left).replace(/\\/g, '/').toLowerCase() === String(right).replace(/\\/g, '/').toLowerCase()
  const position = siblings.findIndex((item) => sameFile(item, tab.imagePath))
  const hasPrevious = position > 0
  const hasNext = position !== -1 && position < siblings.length - 1

  const goTo = useCallback((index) => {
    const target = siblings[index]
    if (target && onNavigate) onNavigate(tab.id, target)
  }, [siblings, onNavigate, tab.id])

  // Si precaricano le due immagini vicine, così il passaggio è immediato.
  useEffect(() => {
    for (const index of [position - 1, position + 1]) {
      if (siblings[index]) { const preload = new Image(); preload.src = imageFileUrl(siblings[index]) }
    }
  }, [position, siblings])

  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const moves = { ArrowLeft: position - 1, ArrowUp: position - 1, PageUp: position - 1, ArrowRight: position + 1, ArrowDown: position + 1, PageDown: position + 1, Home: 0, End: siblings.length - 1 }
    if (!(event.key in moves) || position === -1) return
    event.preventDefault()
    const target = Math.min(siblings.length - 1, Math.max(0, moves[event.key]))
    if (target !== position) goTo(target)
  }

  useEffect(() => {
    let cancelled = false
    setInfo(null)
    setFailed(false)
    setSize(null)
    setFit(true)
    electronAPI.getFileInfo(tab.imagePath).then((value) => { if (!cancelled) setInfo(value) }).catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [tab.imagePath])

  // Vista che adatta l'immagine alla finestra (senza ingrandirla oltre la grandezza reale), centrata.
  const fitView = useCallback(() => {
    const element = stage.current
    const { size: image } = state.current
    if (!element || !image) return null
    const width = element.clientWidth
    const height = element.clientHeight
    const scale = clampScale(Math.min(1, (width - PADDING * 2) / image.width, (height - PADDING * 2) / image.height))
    return { scale, x: (width - image.width * scale) / 2, y: (height - image.height * scale) / 2 }
  }, [])

  const actualView = useCallback(() => {
    const element = stage.current
    const { size: image } = state.current
    if (!element || !image) return null
    return { scale: 1, x: (element.clientWidth - image.width) / 2, y: (element.clientHeight - image.height) / 2 }
  }, [])

  // Adattata finché non la si tocca: segue anche il ridimensionamento della finestra.
  useEffect(() => {
    if (!fit || !size) return undefined
    const apply = () => { const next = fitView(); if (next) setView(next) }
    apply()
    const observer = new ResizeObserver(apply)
    if (stage.current) observer.observe(stage.current)
    return () => observer.disconnect()
  }, [fit, size, fitView, active])

  // Il panning serve solo dove l'immagine sborda: su un asse in cui sta nella finestra resta centrata, altrimenti non si può scoprire più dello spazio vuoto oltre il bordo.
  const constrain = useCallback((next) => {
    const element = stage.current
    const { size: image } = state.current
    if (!element || !image) return next
    const axis = (offset, content, container) => (content <= container ? (container - content) / 2 : Math.min(0, Math.max(container - content, offset)))
    return { scale: next.scale, x: axis(next.x, image.width * next.scale, element.clientWidth), y: axis(next.y, image.height * next.scale, element.clientHeight) }
  }, [])

  // Ingrandisce o rimpicciolisce tenendo fermo il punto sotto il puntatore (o il centro, se la chiamata viene dai pulsanti).
  const zoomBy = useCallback((factor, anchor) => {
    const element = stage.current
    if (!element || !state.current.size) return
    const rect = element.getBoundingClientRect()
    const cx = anchor ? anchor.x - rect.left : element.clientWidth / 2
    const cy = anchor ? anchor.y - rect.top : element.clientHeight / 2
    setFit(false)
    setView((current) => {
      const scale = clampScale(current.scale * factor)
      const ratio = scale / current.scale
      return constrain({ scale, x: cx - (cx - current.x) * ratio, y: cy - (cy - current.y) * ratio })
    })
  }, [constrain])

  // La rotella deve poter annullare lo scorrimento della pagina: serve un ascoltatore non passivo.
  useEffect(() => {
    const element = stage.current
    if (!element) return undefined
    const onWheel = (event) => {
      event.preventDefault()
      const step = event.deltaMode === 1 ? event.deltaY * 33 : event.deltaY
      zoomBy(Math.exp(-step * 0.0015), { x: event.clientX, y: event.clientY })
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [zoomBy, failed])

  function onPointerDown(event) {
    // Il clic dà il focus alla scheda: da lì le frecce passano all'immagine successiva.
    root.current?.focus({ preventScroll: true })
    if (event.button !== 0 || !size) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY, view: state.current.view }
    setDragging(true)
  }

  function onPointerMove(event) {
    if (!drag.current) return
    const dx = event.clientX - drag.current.x
    const dy = event.clientY - drag.current.y
    if (state.current.fit && Math.abs(dx) + Math.abs(dy) < 3) return
    const moved = constrain({ ...drag.current.view, x: drag.current.view.x + dx, y: drag.current.view.y + dy })
    // Immagine intera nella finestra: niente da spostare, e la vista adattata resta tale.
    if (state.current.fit && moved.x === state.current.view.x && moved.y === state.current.view.y) return
    setFit(false)
    setView(moved)
  }

  function endDrag(event) {
    if (!drag.current) return
    drag.current = null
    setDragging(false)
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  // Doppio clic: dalla vista adattata alla grandezza reale (centrata sul punto cliccato), e viceversa.
  function toggleSize(event) {
    if (!size) return
    if (state.current.fit || state.current.view.scale < 0.999) {
      const element = stage.current
      const rect = element.getBoundingClientRect()
      const cx = event ? event.clientX - rect.left : element.clientWidth / 2
      const cy = event ? event.clientY - rect.top : element.clientHeight / 2
      const { view: current } = state.current
      const ratio = 1 / current.scale
      setFit(false)
      setView(constrain({ scale: 1, x: cx - (cx - current.x) * ratio, y: cy - (cy - current.y) * ratio }))
    } else {
      setFit(true)
    }
  }

  const canPan = Boolean(size && stage.current && (size.width * view.scale > stage.current.clientWidth + 0.5 || size.height * view.scale > stage.current.clientHeight + 0.5))
  const percent = `${Math.round(view.scale * 100)}%`
  const atActualSize = !fit && Math.abs(view.scale - 1) < 0.001
  const details = [
    size ? `${size.width} × ${size.height} px` : '',
    info ? formatSize(info.size) : '',
    info ? formatDateTime(info.modified, { dateStyle: 'medium', timeStyle: 'short' }) : '',
  ].filter(Boolean).join(' · ')
  const button = 'rounded p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-50 disabled:opacity-30'

  return (
    <div ref={root} tabIndex={-1} className={`${active ? 'flex min-h-0 flex-1 flex-col' : 'hidden'} outline-none`} onKeyDown={onKeyDown} onMouseDown={() => onInteract?.(tab.id)} onWheel={() => onInteract?.(tab.id)}>
      <div className="flex items-center gap-1 border-b border-slate-800 bg-slate-950/40 px-3 py-1.5 text-xs text-slate-400">
        <span className="min-w-0 flex-1 truncate" title={tab.imagePath}><span className="text-slate-200">{tab.title}</span>{details && <span className="ml-2">{details}</span>}</span>
        {position !== -1 && siblings.length > 1 && <span className="mr-1 tabular-nums text-slate-500" aria-label={t('Image {position} of {count}', { position: position + 1, count: siblings.length })}>{position + 1} / {siblings.length}</span>}
        <button type="button" aria-label={t('Zoom out')} title={t('Zoom out')} disabled={!size} className={button} onClick={() => zoomBy(1 / 1.25)}><ZoomOut size={15} /></button>
        <span className="w-11 text-center tabular-nums text-slate-300" aria-live="polite">{size ? percent : ''}</span>
        <button type="button" aria-label={t('Zoom in')} title={t('Zoom in')} disabled={!size} className={button} onClick={() => zoomBy(1.25)}><ZoomIn size={15} /></button>
        <button type="button" aria-label={atActualSize ? t('Fit to window') : t('Actual size')} title={atActualSize ? t('Fit to window') : t('Actual size')} disabled={!size} className={button} onClick={() => (atActualSize ? setFit(true) : (setFit(false), setView(actualView() || view)))}>
          {atActualSize ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
        <button type="button" aria-label={t('Show in file manager')} title={t('Show in file manager')} className={button} onClick={() => electronAPI.revealPath(tab.imagePath).catch((reason) => onStatus?.(reason.message))}>
          <FolderSearch size={15} />
        </button>
      </div>
      <div
        ref={stage}
        className={`image-stage relative min-h-0 flex-1 touch-none select-none overflow-hidden ${canPan ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={toggleSize}
      >
        {failed
          ? <p className="absolute inset-0 m-auto h-fit text-center text-sm text-slate-500">{t('The image could not be read')}</p>
          : (
            <img
              key={tab.imagePath}
              src={imageFileUrl(tab.imagePath)}
              alt={tab.title}
              draggable={false}
              className="absolute left-0 top-0 max-w-none"
              style={{ transformOrigin: '0 0', transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, imageRendering: view.scale >= 4 ? 'pixelated' : 'auto', visibility: size ? 'visible' : 'hidden' }}
              onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
              onError={() => setFailed(true)}
            />
          )}
        {[['previous', hasPrevious, ChevronLeft, 'left-3', t('Previous image'), () => goTo(position - 1)], ['next', hasNext, ChevronRight, 'right-3', t('Next image'), () => goTo(position + 1)]].map(([key, visible, Icon, side, label, action]) => visible && (
          <button
            key={key}
            type="button"
            aria-label={label}
            title={label}
            className={`group absolute ${side} top-1/2 flex h-14 w-10 -translate-y-1/2 items-center justify-center`}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onClick={action}
          >
            {/* Chevron bianco con contorno nero nel tema scuro, invertito (nero con contorno bianco) nel tema chiaro: tratto largo sotto, tratto stretto sopra. */}
            <span className="relative block h-9 w-9">
              <Icon size={36} strokeWidth={5} className="absolute inset-0 text-black [[data-theme='light']_&]:text-white" />
              <Icon size={36} strokeWidth={2.5} className="absolute inset-0 text-white transition group-hover:text-accent-400 [[data-theme='light']_&]:text-black [[data-theme='light']_&]:group-hover:text-accent-400" />
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
