import { useEffect, useMemo, useRef, useState } from 'react'
import { createGraphSim } from '../lib/graphLayout.js'
import { createProjection } from '../lib/graphProjection.js'
import { clearLayout, loadLayout, saveLayout } from '../lib/graphLayoutStore.js'
import { Orbit } from 'lucide-react'
import { createGraphRenderer, cssColor, webglAvailable } from '../lib/graphRenderer.js'
import { loadProjectIcon, onProjectIconsChanged } from '../lib/projectIcons.js'
import { sizedSvgUrl } from '../lib/svgIcon.js'
import { decodeAnimatedIcon, disposeAnimatedIcon, frameAt } from '../lib/animatedIcon.js'
import { ProjectAvatar } from './ProjectIcon.jsx'
import { t, tp } from '../i18n/index.js'

const MIN_ZOOM = 0.4
const MAX_ZOOM = 2.6

const hashOf = (text) => { let hash = 2166136261; for (const char of String(text)) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619) } return hash >>> 0 }
// Il peso di un progetto (0-1) dai suoi file indicizzati, su scala logaritmica: decide la grandezza della bolla e quanto ha rilievo (vedi graphRenderer.js).
const weightOf = (node) => Math.min(1, Math.log2((node.files || 0) + 1) / 7.5)
// I sotto-progetti sono satelliti più piccoli, ma sempre con la loro misura.
const radiusOf = (node) => (node.parent ? 14 + weightOf(node) * 8 : 22 + weightOf(node) * 24)
const ease = (current, target, dt) => current + (target - current) * Math.min(1, dt * 9)

function loadImage(url) {
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = url
  })
}

const flagsOf = (node) => `${node.temporary ? `${t('Temporary')} · ` : ''}${!node.indexed ? t('Search index off') : node.shared ? t('Shares its knowledge') : t('Does not share its knowledge')}`

/**
 * La rete dei progetti: una bolla con l'icona per progetto, sinapsi tra quelli affini per significato, bolle libere che galleggiano per gli altri.
 * `graph`: { nodes, edges } da `projects:graph`; `matches`: Map(percorso progetto → numero di passaggi trovati) o null; `activePath`: il progetto aperto;
 * `onOpen(percorso)`. Se WebGL2 non c'è si mostra una griglia semplice con le stesse icone.
 */
export default function ProjectGraph({ graph, matches = null, activePath = null, onOpen, onContext }) {
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
  live.current.onContext = onContext
  live.current.visible = visible
  live.current.graph = graph

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
    // La rete è stabile: niente deriva né giro dei satelliti (`wander: false`). La simulazione lavora solo dopo un evento (un progetto nuovo, una bolla spostata, il ricalcolo)
    // e poi si ferma, e le posizioni si ricordano (graphLayoutStore.js): al ricaricamento le bolle sono dove le avevi lasciate.
    const sim = createGraphSim({ seed: 11, wander: false })
    let awakeUntil = 0
    let awake = false
    const wake = (ms) => { awakeUntil = Math.max(awakeUntil, performance.now() + ms) }
    // Ogni spazio di lavoro ha la sua disposizione (graphLayoutStore.js): `layoutKey` è quello dei dati mostrati (arriva con il grafo).
    let layoutKey = 'all'
    const remember = () => saveLayout(sim.nodes.map((node) => ({ id: node.id, x: node.x, y: node.y, z: node.z })), undefined, layoutKey)
    // `yaw` / `pitch`: dove si vuole portare l'inclinazione della rete (tasto destro sullo sfondo e trascinamento); `tilt`: quella mostrata, che la segue con dolcezza.
    // La rete è un piano visto in prospettiva (graphProjection.js): ruotano le posizioni, le icone restano dritte e rivolte verso chi guarda.
    const camera = { x: 0, y: 0, zoom: 1, yaw: 0, pitch: 0 }
    const tilt = { yaw: 0, pitch: 0 }
    let projection = createProjection()
    const TURN = Math.PI * 2
    const size = { width: wrap.clientWidth || 800, height: wrap.clientHeight || 600, top: 84 }
    const mood = new Map() // id → { lit, dim }
    // I dati del grafo cambiano mentre l'indice lavora (collegamenti nuovi, pesi diversi): renderer, simulazione e telecamera restano, e `applyGraph` aggiorna solo questi.
    let list = []
    let index = new Map()
    let weights = new Map()
    let running = true
    let frameId = 0
    let last = performance.now()
    // I colori si leggono dalla Home stessa (`.home-dark`): lo sfondo è sempre scuro, qualunque sia il tema dell'app.
    const readColors = () => ({ accent: cssColor('--accent-400', undefined, wrap), border: cssColor('--slate-700', [0.25, 0.25, 0.26], wrap) })
    let colors = readColors()

    // Le icone: si disegnano subito le iniziali, poi l'atlante si rifà quando le immagini sono lette.
    let entries = []
    let iconsCancelled = false
    // Rilegge le icone (quelle già note vengono dalla cache) e rifà l'atlante. `always`: anche se nessun progetto ha un'immagine (un'icona tolta torna all'iniziale).
    // Più riletture possono sovrapporsi (due icone cambiate di seguito): conta solo l'ultima, altrimenti una più lenta riscriverebbe un'immagine vecchia.
    let iconRun = 0
    let animated = []
    let lastFrame = 0
    const keeper = document.createElement('div')
    keeper.setAttribute('aria-hidden', 'true')
    keeper.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none'
    wrap.appendChild(keeper)
    const loadIcons = async (always) => {
      const run = ++iconRun
      const images = await Promise.all(list.map(async (node) => {
        const url = await loadProjectIcon(node.path)
        return url ? { image: await loadImage(await sizedSvgUrl(url)), url, animated: /^data:image\/(gif|webp)/i.test(url) } : { image: null, url: null, animated: false }
      }))
      if (iconsCancelled || run !== iconRun) return
      for (const entry of entries) { disposeAnimatedIcon(entry.anim); entry.anim = null; entry.shown = null }
      images.forEach(({ image, animated: isAnimated }, position) => { entries[position].image = image; entries[position].animated = Boolean(image) && isAnimated })
      // Immagine animata: si decodificano i fotogrammi (animatedIcon.js) e se ne mostra uno in base al tempo. Se non si può (niente ImageDecoder), l'immagine resta nel
      // documento, invisibile, perché il browser ne faccia avanzare i fotogrammi, e ogni tanto se ne ricopia quello corrente nella texture.
      keeper.replaceChildren(...entries.filter((entry) => entry.animated).map((entry) => entry.image))
      animated = entries.map((entry, position) => (entry.animated ? position : -1)).filter((position) => position >= 0)
      await Promise.all(animated.map(async (position) => {
        const anim = await decodeAnimatedIcon(images[position].url)
        if (iconsCancelled || run !== iconRun) { disposeAnimatedIcon(anim); return }
        entries[position].anim = anim
      }))
      if (iconsCancelled || run !== iconRun) return
      if (always || entries.some((entry) => entry.image)) renderer.setIcons(entries)
    }
    // Applica il grafo corrente (`live.current`) alla simulazione che c'è già: le bolle conosciute restano dove sono, quelle nuove entrano, le sinapsi cambiano
    // con le molle (senza scatti). Le icone si rifanno solo se cambia l'elenco dei progetti o i loro nomi, non a ogni variazione di peso.
    let applied
    let signature = null
    const applyGraph = ({ animate = false, ignoreSaved = false } = {}) => {
      const { visible: nodesNow, graph: data } = live.current
      if (data === applied && !animate) return
      applied = data
      // Cambia lo spazio di lavoro: la rete riparte dalla disposizione di quello (le bolle già presenti non restano dove stavano nell'altro). Se quello spazio non ne ha ancora
      // una, parte da quella di «Tutti» (i progetti hanno già il loro posto) e da subito la si ricorda.
      const workspace = data?.workspace || 'all'
      let remembered = true
      if (workspace !== layoutKey) {
        layoutKey = workspace
        sim.setGraph([], [], size)
        for (const key of mood.keys()) mood.delete(key)
        remembered = Object.keys(loadLayout(undefined, layoutKey)).length > 0
      }
      list = nodesNow
      index = new Map(list.map((node, position) => [node.path, position]))
      weights = new Map(list.map((node) => [node.path, weightOf(node)]))
      const known = new Set(list.map((node) => node.path))
      // Le posizioni ricordate dello spazio; uno spazio diverso da «Tutti» si appoggia a quelle di «Tutti» per i progetti che non ha ancora disposto. Ricalcolando non si usano.
      const saved = ignoreSaved ? {} : layoutKey === 'all' ? loadLayout(undefined, 'all') : { ...loadLayout(undefined, 'all'), ...loadLayout(undefined, layoutKey) }
      const before = new Set(sim.nodes.map((node) => node.id))
      sim.setGraph(list.map((node) => ({ id: node.path, r: radiusOf(node), data: weightOf(node), at: saved[node.path] || null, parent: node.parent && known.has(node.parent) ? node.parent : null })), (data?.edges || []).map((edge) => ({ a: edge.a, b: edge.b, weight: edge.weight })), size)
      // Chi ha già un posto (ricordato o già nella rete) resta fermo: solo le bolle nuove cercano il loro, tenendo conto di quelle che ci sono, e poi la rete si ricorda.
      const arrivals = sim.nodes.filter((node) => !node.placed && !before.has(node.id))
      if (arrivals.length) {
        if (animate) {
          wake(6000)
        } else {
          const fixed = sim.nodes.filter((node) => !arrivals.includes(node) && !node.pinned)
          for (const node of fixed) node.pinned = true
          sim.settle(420, size)
          for (const node of fixed) node.pinned = false
          sim.freeze(true)
          sim.freeze(false)
          remember()
          remembered = true
        }
      }
      if (!remembered) remember()
      const next = list.map((node) => `${node.path}|${node.name}`).join('\n')
      if (next === signature) return
      signature = next
      animated = []
      for (const entry of entries) disposeAnimatedIcon(entry.anim)
      entries = list.map((node) => ({ image: null, initial: Array.from(String(node.name || '?').trim())[0]?.toUpperCase() || '?', hue: hashOf(node.name) % 360 }))
      renderer.setIcons(entries)
      loadIcons(false)
    }
    live.current.apply = applyGraph
    // Il pulsante «Ricalcola»: si dimentica la disposizione e la rete si ricompone da zero, con un movimento che poi si ferma.
    live.current.recalc = () => {
      clearLayout(undefined, layoutKey)
      sim.setGraph([], [], size)
      for (const key of mood.keys()) mood.delete(key)
      applyGraph({ animate: true, ignoreSaved: true })
      if (reduced) { sim.settle(420, size); remember() }
    }
    // Il carattere dell'interfaccia potrebbe non essere ancora caricato quando si disegnano le iniziali: a font pronto l'atlante si rifà.
    document.fonts?.ready?.then(() => { if (!iconsCancelled) renderer.setIcons(entries) }).catch(() => {})
    applyGraph()
    // L'utente cambia o toglie l'icona di un progetto (impostazioni del progetto): il grafo, anche se la Home è nascosta, si aggiorna.
    const stopListeningIcons = onProjectIconsChanged(() => { loadIcons(true) })

    const resizeObserver = new ResizeObserver(() => { size.width = wrap.clientWidth || size.width; size.height = wrap.clientHeight || size.height })
    resizeObserver.observe(wrap)

    // Il punto del puntatore nello spazio visto (prima di zoom e spostamento della telecamera).
    const toView = (clientX, clientY) => {
      const rect = wrap.getBoundingClientRect()
      return { x: (clientX - rect.left - rect.width / 2) / camera.zoom + camera.x, y: (clientY - rect.top - rect.height / 2) / camera.zoom + camera.y }
    }
    // La bolla sotto il puntatore: si confronta con le posizioni proiettate (hanno una profondità) e, se ce ne sono più d'una, vince la più vicina a chi guarda.
    const pick = (clientX, clientY, slack = 4 / camera.zoom) => {
      const point = toView(clientX, clientY)
      let best = null
      for (const node of sim.nodes) {
        const p = projection.project(node.x, node.y, node.z)
        if (Math.hypot(p.x - point.x, p.y - point.y) <= node.r * p.scale + slack && (!best || p.z < best.z)) best = { id: node.id, z: p.z }
      }
      return best
    }

    // ----- Puntatore: trascinare una bolla, spostare lo spazio, zoom con la rotella, clic per aprire. -----
    let gesture = null
    const onPointerDown = (event) => {
      if (event.target.closest?.('[data-graph-control]')) return
      // Tasto destro sullo sfondo: trascinando si gira la rete nello spazio (a destra o a sinistra sull'asse Y, in alto o in basso sull'asse X). Su una bolla resta il menu del progetto.
      if (event.button === 2) {
        if (pick(event.clientX, event.clientY)) return
        gesture = { turn: true, lastX: event.clientX, lastY: event.clientY }
        wrap.setPointerCapture?.(event.pointerId)
        wrap.style.cursor = 'grabbing'
        return
      }
      if (event.button !== 0) return
      const hit = pick(event.clientX, event.clientY)
      gesture = { id: hit?.id || null, startX: event.clientX, startY: event.clientY, lastX: event.clientX, lastY: event.clientY, moved: false }
      wrap.setPointerCapture?.(event.pointerId)
    }
    const onPointerMove = (event) => {
      if (gesture?.turn) {
        camera.yaw -= (event.clientX - gesture.lastX) * 0.006
        camera.pitch += (event.clientY - gesture.lastY) * 0.006
        gesture.lastX = event.clientX
        gesture.lastY = event.clientY
        return
      }
      if (gesture) {
        if (!gesture.moved && Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 4) gesture.moved = true
        if (gesture.moved) {
          if (gesture.id) { const view = toView(event.clientX, event.clientY); const point = projection.unproject(view.x, view.y, sim.get(gesture.id)?.z || 0); sim.pin(gesture.id, point.x, point.y); wake(3000) }
          else { camera.x -= (event.clientX - gesture.lastX) / camera.zoom; camera.y -= (event.clientY - gesture.lastY) / camera.zoom }
        }
        gesture.lastX = event.clientX
        gesture.lastY = event.clientY
        return
      }
      const hit = pick(event.clientX, event.clientY)
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
        // Spostata: le altre si assestano attorno (qualche secondo) e poi la rete si ricorda; con «riduci movimento» si assesta subito.
        if (finished.moved) { if (reduced) { sim.settle(240, size); remember() } else wake(3000) }
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
      if (!pick(event.clientX, event.clientY, 0)) { camera.x = 0; camera.y = 0; camera.zoom = 1; camera.yaw = 0; camera.pitch = 0 }
    }
    // Tasto destro su una bolla: il chiamante apre il menu del progetto. Sullo sfondo non succede nulla (e non compare il menu del browser).
    const onContextMenu = (event) => {
      event.preventDefault()
      if (event.target.closest?.('[data-graph-control]')) return
      const hit = pick(event.clientX, event.clientY)
      if (hit) live.current.onContext?.(hit.id, event.clientX, event.clientY)
    }
    wrap.addEventListener('contextmenu', onContextMenu)
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
      // La simulazione lavora solo dopo un evento; quando si ferma, le posizioni si ricordano.
      if (now < awakeUntil) { sim.step(dt, size); awake = true } else if (awake) { awake = false; sim.freeze(true); sim.freeze(false); remember() }
      // I satelliti girano sempre intorno al padre (solo un effetto: non cambia la disposizione ricordata); non con «riduci movimento».
      if (!reduced) sim.orbit(dt)
      // Icone animate: circa 12 fotogrammi al secondo (non con «riduci movimento»).
      if (animated.length && !reduced) {
        const dirty = []
        for (const position of animated) {
          const entry = entries[position]
          if (entry.anim) {
            const bitmap = frameAt(entry.anim, now)
            if (bitmap !== entry.shown) { entry.shown = bitmap; entry.image = bitmap; dirty.push(position) }
          } else if (now - lastFrame > 80) dirty.push(position)
        }
        if (dirty.length) { if (dirty.some((position) => !entries[position].anim)) lastFrame = now; renderer.refreshCells(dirty) }
      }

      // Giro senza fine: gli angoli si tengono entro un giro (modulo 2π, spostando di pari passo quello voluto e quello mostrato), così non crescono mai
      // e il ritorno al piano (doppio clic) prende la strada più corta.
      for (const key of ['yaw', 'pitch']) {
        const turns = Math.round(tilt[key] / TURN)
        if (turns) { tilt[key] -= turns * TURN; camera[key] -= turns * TURN }
      }
      // L'inclinazione mostrata segue quella voluta; con «riduci movimento» ci arriva subito.
      tilt.yaw = reduced ? camera.yaw : ease(tilt.yaw, camera.yaw, dt)
      tilt.pitch = reduced ? camera.pitch : ease(tilt.pitch, camera.pitch, dt)
      projection = createProjection(tilt)
      const at = (x, y, z = 0) => projection.project(x, y, z)
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
        const p = at(node.x, node.y, node.z)
        // In prospettiva: le bolle lontane sono più piccole e, di poco, più spente.
        return { x: p.x, y: p.y, z: p.z, r: node.r * p.scale, cell: index.get(node.id) ?? 0, lit: state.lit, dim: Math.min(1, state.dim + Math.min(0.3, Math.max(0, p.z / 1500))), free: node.degree === 0 && !node.parent, weight: weights.get(node.id) ?? 0 }
      })
      // Prima le più lontane: le vicine le coprono.
      nodes.sort((a, b) => b.z - a.z)
      const edges = sim.edges.map((edge) => {
        const pa = at(edge.a.x, edge.a.y, edge.a.z)
        const pb = at(edge.b.x, edge.b.y, edge.b.z)
        const seed = hashOf(`${edge.a.id}|${edge.b.id}`)
        const lit = Math.max(mood.get(edge.a.id)?.lit || 0, mood.get(edge.b.id)?.lit || 0)
        const touched = hovered && (edge.a.id === hovered || edge.b.id === hovered)
        return {
          ax: pa.x, ay: pa.y, bx: pb.x, by: pb.y, az: pa.z, bz: pb.z, weight: edge.weight,
          curve: ((seed % 1000) / 1000 - 0.5) * 0.34, phase: (seed >>> 10) % 1000 / 1000,
          lit: touched ? 1 : Math.min(lit, searching ? 1 : 0.5),
          reachA: mood.get(edge.a.id)?.reach ?? 1, reachB: mood.get(edge.b.id)?.reach ?? 1,
        }
      })
      // Il legame tra un satellite e il suo padre: un filo corto, sempre acceso quanto il più evidenziato dei due.
      for (const node of sim.nodes) {
        if (!node.parent) continue
        const lit = Math.max(mood.get(node.id)?.lit || 0, mood.get(node.parent.id)?.lit || 0)
        const from = at(node.parent.x, node.parent.y, node.parent.z)
        const to = at(node.x, node.y, node.z)
        edges.push({
          ax: from.x, ay: from.y, bx: to.x, by: to.y, az: from.z, bz: to.z, weight: -1, curve: 0, phase: (hashOf(node.id) % 1000) / 1000,
          lit: Math.min(1, lit + 0.15), reachA: mood.get(node.parent.id)?.reach ?? 1, reachB: mood.get(node.id)?.reach ?? 1,
        })
      }
      renderer.draw({ time: now / 1000, still: reduced, pan: [camera.x, camera.y], zoom: camera.zoom, colors, nodes, edges, dim: hovered ? 0.65 : 0 })

      for (const node of sim.nodes) {
        const element = labelRefs.current.get(node.id)
        if (!element) continue
        const p = at(node.x, node.y, node.z)
        const x = (p.x - camera.x) * camera.zoom + size.width / 2
        const y = (p.y - camera.y) * camera.zoom + size.height / 2 + (node.r * p.scale + 6) * camera.zoom
        element.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translateX(-50%)`
        // Le etichette si vedono solo sotto il puntatore (o col focus da tastiera).
        const state = mood.get(node.id)
        if (state) state.label = ease(state.label || 0, node.id === hovered ? 1 : 0, dt)
        element.style.opacity = String((state?.label || 0) < 0.02 ? 0 : state.label)
      }
    }
    frameId = requestAnimationFrame(loop)

    // Il tema può cambiare mentre la Home è aperta: i colori si rileggono.
    const themeObserver = new MutationObserver(() => { colors = readColors() })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] })

    return () => {
      running = false
      live.current.apply = null
      iconsCancelled = true
      keeper.remove()
      for (const entry of entries) disposeAnimatedIcon(entry.anim)
      stopListeningIcons()
      cancelAnimationFrame(frameId)
      resizeObserver.disconnect()
      themeObserver.disconnect()
      wrap.removeEventListener('contextmenu', onContextMenu)
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
  }, [supported])

  // Il grafo è cambiato (l'indice ha lavorato): si aggiorna la simulazione in corso, senza ricrearla.
  useEffect(() => { live.current.apply?.() }, [graph])

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
      {/* Un'icona discreta e traslucida: la rete è stabile, e solo qui si chiede di ricalcolarla da zero. */}
      <button
        type="button"
        data-graph-control="true"
        title={t('Recalculate the layout')}
        aria-label={t('Recalculate the layout')}
        className="absolute bottom-3 left-3 rounded-full p-2 text-slate-300 opacity-25 transition hover:bg-slate-800/60 hover:opacity-90 focus-visible:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent-400"
        onClick={() => live.current.recalc?.()}
      ><Orbit size={18} aria-hidden="true" /></button>
      {hovered && (
        <p className="pointer-events-none absolute bottom-3 left-14 max-w-[70%] truncate rounded-md border border-slate-700 bg-slate-900/90 px-2.5 py-1 text-xs text-slate-300 shadow-lg">
          <span className="font-medium text-slate-100">{hovered.name}</span> · {tp(hovered.files, { one: '{count} file', other: '{count} files' }, { count: hovered.files })} · {flagsOf(hovered)}
        </p>
      )}
    </div>
  )
}
