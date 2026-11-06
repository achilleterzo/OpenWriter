import { useEffect, useMemo, useRef, useState } from 'react'
import { createGraphSim } from '../lib/graphLayout.js'
import { createGraphRenderer, cssColor, webglAvailable } from '../lib/graphRenderer.js'
import { loadProjectIcon } from '../lib/projectIcons.js'
import { ProjectAvatar } from './ProjectIcon.jsx'
import { t, tp } from '../i18n/index.js'

const MIN_ZOOM = 0.4
const MAX_ZOOM = 2.6

const hashOf = (text) => { let hash = 2166136261; for (const char of String(text)) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619) } return hash >>> 0 }
const radiusOf = (node) => 26 + Math.min(16, Math.log2((node.files || 0) + 1) * 2.6)
const ease = (current, target, dt) => current + (target - current) * Math.min(1, dt * 9)

function loadImage(url) {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = url
  })
}

const flagsOf = (node) => (!node.indexed ? t('Search index off') : node.shared ? t('Shares its knowledge') : t('Does not share its knowledge'))

/**
 * La rete dei progetti: una bolla con l'icona per progetto, sinapsi tra quelli affini per significato, bolle libere che galleggiano per gli altri.
 * `graph`: { nodes, edges } da `projects:graph`; `matches`: Map(percorso progetto → numero di passaggi trovati) o null; `activePath`: il progetto aperto;
 * `onOpen(percorso)`. Se WebGL2 non c'è si mostra una griglia semplice con le stesse icone.
 */
export default function ProjectGraph({ graph, matches = null, activePath = null, onOpen }) {
  const wrapRef = useRef(null)
  const labelRefs = useRef(new Map())
  const live = useRef({})
  const [hoverId, setHoverId] = useState(null)
  const supported = useMemo(() => webglAvailable(), [])
  const visible = useMemo(() => (graph?.nodes || []).filter((node) => !node.missing), [graph])

  // Gli input dell'animazione stanno in un riferimento: il ciclo di disegno non deve ripartire a ogni cambio di ricerca o di passaggio del mouse.
  live.current.matches = matches
  live.current.activePath = activePath
  live.current.hoverId = hoverId
  live.current.onOpen = onOpen

  useEffect(() => {
    if (!supported || !wrapRef.current) return undefined
    const wrap = wrapRef.current
    // Il canvas si crea a ogni montaggio (e si toglie allo smontaggio): un contesto WebGL liberato non si riavvia sullo stesso canvas,
    // e in sviluppo React monta due volte il componente.
    const canvas = document.createElement('canvas')
    canvas.className = 'absolute inset-0 h-full w-full'
    canvas.setAttribute('aria-hidden', 'true')
    wrap.prepend(canvas)
    let renderer
    try { renderer = createGraphRenderer(canvas) } catch (error) { console.warn('WebGL2 non disponibile per la Home', error); canvas.remove(); return undefined }

    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const sim = createGraphSim({ seed: 11, wander: !reduced })
    const camera = { x: 0, y: 0, zoom: 1 }
    const size = { width: wrap.clientWidth || 800, height: wrap.clientHeight || 600, top: 84 }
    const mood = new Map() // id → { lit, dim }
    const index = new Map(visible.map((node, position) => [node.path, position]))
    let running = true
    let frameId = 0
    let last = performance.now()
    // I colori si leggono dalla Home stessa (`.home-dark`): lo sfondo è sempre scuro, qualunque sia il tema dell'app.
    const readColors = () => ({ accent: cssColor('--accent-400', undefined, wrap), border: cssColor('--slate-700', [0.25, 0.25, 0.26], wrap) })
    let colors = readColors()

    sim.setGraph(visible.map((node) => ({ id: node.path, r: radiusOf(node) })), (graph?.edges || []).map((edge) => ({ a: edge.a, b: edge.b, weight: edge.weight })), size)
    sim.settle(420, size)
    if (reduced) sim.freeze()

    // Le icone: si disegnano subito le iniziali, poi l'atlante si rifà quando le immagini sono lette.
    const entries = visible.map((node) => ({ image: null, initial: Array.from(String(node.name || '?').trim())[0]?.toUpperCase() || '?', hue: hashOf(node.name) % 360 }))
    renderer.setIcons(entries)
    let iconsCancelled = false
    Promise.all(visible.map(async (node, position) => {
      const url = await loadProjectIcon(node.path)
      if (url) entries[position].image = await loadImage(url)
    })).then(() => { if (!iconsCancelled && entries.some((entry) => entry.image)) renderer.setIcons(entries) })

    const resizeObserver = new ResizeObserver(() => { size.width = wrap.clientWidth || size.width; size.height = wrap.clientHeight || size.height })
    resizeObserver.observe(wrap)

    const toWorld = (clientX, clientY) => {
      const rect = wrap.getBoundingClientRect()
      return { x: (clientX - rect.left - rect.width / 2) / camera.zoom + camera.x, y: (clientY - rect.top - rect.height / 2) / camera.zoom + camera.y }
    }

    // ----- Puntatore: trascinare una bolla, spostare lo spazio, zoom con la rotella, clic per aprire. -----
    let gesture = null
    const onPointerDown = (event) => {
      if (event.button !== 0) return
      const point = toWorld(event.clientX, event.clientY)
      const hit = sim.nodeAt(point.x, point.y, 4 / camera.zoom)
      gesture = { id: hit?.id || null, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false }
      wrap.setPointerCapture?.(event.pointerId)
    }
    const onPointerMove = (event) => {
      if (gesture) {
        if (!gesture.moved && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 4) gesture.moved = true
        if (gesture.moved) {
          if (gesture.id) { const point = toWorld(event.clientX, event.clientY); sim.pin(gesture.id, point.x, point.y) }
          else { camera.x -= (event.clientX - gesture.lastX) / camera.zoom; camera.y -= (event.clientY - gesture.lastY) / camera.zoom }
        }
        gesture.lastX = event.clientX
        gesture.lastY = event.clientY
        return
      }
      const point = toWorld(event.clientX, event.clientY)
      const hit = sim.nodeAt(point.x, point.y, 4 / camera.zoom)
      wrap.style.cursor = hit ? 'pointer' : 'grab'
      setHoverId((current) => (current === (hit?.id || null) ? current : hit?.id || null))
    }
    const onPointerUp = (event) => {
      if (!gesture) return
      const finished = gesture
      gesture = null
      wrap.releasePointerCapture?.(event.pointerId)
      if (finished.id) {
        sim.release(finished.id)
        if (!finished.moved) live.current.onOpen?.(finished.id)
      }
    }
    const onPointerLeave = () => { if (!gesture) setHoverId(null) }
    const onWheel = (event) => {
      event.preventDefault()
      const rect = wrap.getBoundingClientRect()
      const cx = event.clientX - rect.left - rect.width / 2
      const cy = event.clientY - rect.top - rect.height / 2
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom * Math.exp(-event.deltaY * 0.0012)))
      // Il punto sotto il puntatore resta fermo.
      camera.x += cx * (1 / camera.zoom - 1 / next)
      camera.y += cy * (1 / camera.zoom - 1 / next)
      camera.zoom = next
    }
    const onDoubleClick = (event) => {
      const point = toWorld(event.clientX, event.clientY)
      if (!sim.nodeAt(point.x, point.y)) { camera.x = 0; camera.y = 0; camera.zoom = 1 }
    }
    wrap.addEventListener('pointerdown', onPointerDown)
    wrap.addEventListener('pointermove', onPointerMove)
    wrap.addEventListener('pointerup', onPointerUp)
    wrap.addEventListener('pointercancel', onPointerUp)
    wrap.addEventListener('pointerleave', onPointerLeave)
    wrap.addEventListener('wheel', onWheel, { passive: false })
    wrap.addEventListener('dblclick', onDoubleClick)

    // ----- Il ciclo: fisica, disegno, etichette. Si ferma quando la Home non si vede. -----
    const loop = (now) => {
      if (!running) return
      frameId = requestAnimationFrame(loop)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (!wrap.offsetParent && !wrap.offsetWidth) return
      sim.step(dt, size)

      const { matches: found, activePath: opened, hoverId: hovered } = live.current
      const searching = Boolean(found)
      const neighbors = new Set()
      if (hovered) for (const edge of sim.edges) { if (edge.a.id === hovered) neighbors.add(edge.b.id); if (edge.b.id === hovered) neighbors.add(edge.a.id) }

      const nodes = sim.nodes.map((node) => {
        const target = { lit: 0, dim: 0 }
        if (node.id === opened) target.lit = 0.4
        if (searching) {
          if (found.has(node.id)) target.lit = 1
          else target.dim = 1
        }
        if (hovered) {
          if (node.id === hovered) target.lit = 1
          else if (neighbors.has(node.id)) target.lit = Math.max(target.lit, 0.65)
          else if (!searching) target.dim = 0.55
        }
        const state = mood.get(node.id) || { lit: target.lit, dim: target.dim, reach: 1 }
        state.lit = ease(state.lit, target.lit, dt)
        state.dim = ease(state.dim, target.dim, dt)
        // In una ricerca le sinapsi si interrompono verso chi non ha risultati.
        state.reach = ease(state.reach, searching && !found.has(node.id) ? 0 : 1, dt)
        mood.set(node.id, state)
        return { x: node.x, y: node.y, r: node.r, cell: index.get(node.id) ?? 0, lit: state.lit, dim: state.dim, free: node.degree === 0 }
      })
      const edges = sim.edges.map((edge) => {
        const seed = hashOf(`${edge.a.id}|${edge.b.id}`)
        const lit = Math.max(mood.get(edge.a.id)?.lit || 0, mood.get(edge.b.id)?.lit || 0)
        const touched = hovered && (edge.a.id === hovered || edge.b.id === hovered)
        return {
          ax: edge.a.x, ay: edge.a.y, bx: edge.b.x, by: edge.b.y, weight: edge.weight,
          curve: ((seed % 1000) / 1000 - 0.5) * 0.34, phase: (seed >>> 10) % 1000 / 1000,
          lit: touched ? 1 : Math.min(lit, searching ? 1 : 0.5),
          reachA: mood.get(edge.a.id)?.reach ?? 1, reachB: mood.get(edge.b.id)?.reach ?? 1,
        }
      })
      renderer.draw({ time: now / 1000, still: reduced, pan: [camera.x, camera.y], zoom: camera.zoom, colors, nodes, edges, dim: hovered ? 0.65 : 0 })

      for (const node of sim.nodes) {
        const element = labelRefs.current.get(node.id)
        if (!element) continue
        const x = (node.x - camera.x) * camera.zoom + size.width / 2
        const y = (node.y - camera.y) * camera.zoom + size.height / 2 + (node.r + 6) * camera.zoom
        element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translateX(-50%)`
        element.style.opacity = String(1 - 0.65 * (mood.get(node.id)?.dim || 0))
      }
    }
    frameId = requestAnimationFrame(loop)

    // Il tema può cambiare mentre la Home è aperta: i colori si rileggono.
    const themeObserver = new MutationObserver(() => { colors = readColors() })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] })

    return () => {
      running = false
      iconsCancelled = true
      cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      themeObserver.disconnect()
      wrap.removeEventListener('pointerdown', onPointerDown)
      wrap.removeEventListener('pointermove', onPointerMove)
      wrap.removeEventListener('pointerup', onPointerUp)
      wrap.removeEventListener('pointercancel', onPointerUp)
      wrap.removeEventListener('pointerleave', onPointerLeave)
      wrap.removeEventListener('wheel', onWheel)
      wrap.removeEventListener('dblclick', onDoubleClick)
      renderer.dispose()
      canvas.remove()
    }
  }, [supported, visible, graph])

  if (!supported) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center gap-4 overflow-y-auto p-6">
        <p className="text-xs text-slate-500">{t('The graph needs WebGL2, which is not available: the projects are listed here instead.')}</p>
        <div className="flex flex-wrap justify-center gap-4">
          {visible.map((node) => (
            <button key={node.path} type="button" title={node.path} className="flex w-24 flex-col items-center gap-1 rounded-lg p-2 text-center text-xs text-slate-300 transition hover:bg-slate-800" onClick={() => onOpen?.(node.path)}>
              <ProjectAvatar directory={node.path} name={node.name} active={node.path === activePath} size={56} />
              <span className="line-clamp-2 break-words">{node.name}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const hovered = visible.find((node) => node.path === hoverId)
  return (
    <div ref={wrapRef} className="relative min-h-0 flex-1 touch-none select-none overflow-hidden" style={{ cursor: 'grab' }} role="group" aria-label={t('Projects network')}>
      {visible.map((node) => (
        <button
          key={node.path}
          ref={(element) => { if (element) labelRefs.current.set(node.path, element); else labelRefs.current.delete(node.path) }}
          type="button"
          title={node.path}
          className="graph-label pointer-events-none absolute left-0 top-0 max-w-44 truncate rounded-md px-2 py-0.5 text-xs outline-none focus-visible:ring-1 focus-visible:ring-accent-400"
          data-active={node.path === activePath ? 'true' : undefined}
          data-muted={node.indexed ? undefined : 'true'}
          style={{ transform: 'translate(-9999px, -9999px)' }}
          onFocus={() => setHoverId(node.path)}
          onBlur={() => setHoverId((current) => (current === node.path ? null : current))}
          onClick={() => onOpen?.(node.path)}
        >{node.name}</button>
      ))}
      {hovered && (
        <p className="pointer-events-none absolute bottom-3 left-3 max-w-[70%] truncate rounded-md border border-slate-700 bg-slate-900/90 px-2.5 py-1 text-xs text-slate-300 shadow-lg">
          <span className="font-medium text-slate-100">{hovered.name}</span> · {tp(hovered.files, { one: '{count} file', other: '{count} files' }, { count: hovered.files })} · {flagsOf(hovered)}
        </p>
      )}
    </div>
  )
}
