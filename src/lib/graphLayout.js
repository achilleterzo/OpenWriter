/**
 * Fisica della rete dei progetti nella Home: molle lungo le connessioni, repulsione tra tutte le bolle, gravità leggera verso il centro per chi è
 * connesso. Le bolle senza connessioni non sono legate a nulla: galleggiano con una deriva lenta dentro lo spazio (e rimbalzano dolcemente sui bordi).
 * È codice puro (nessun DOM): il disegno sta in graphRenderer.js. Coordinate del mondo in pixel, origine al centro.
 */
const TAU = Math.PI * 2

// Generatore pseudocasuale con seme: stesse posizioni di partenza a ogni apertura (e prove ripetibili).
export function mulberry32(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const REPULSION = 900000
const SPRING = 3.2
const GRAVITY = 0.09
const MAX_SPEED = 420
const WANDER = 16
const WALL = 9

export function createGraphSim({ seed = 7, wander = true } = {}) {
  const random = mulberry32(seed)
  let nodes = []
  let edges = []
  let byId = new Map()
  let time = 0
  let wandering = wander
  let frozen = false

  // `items`: [{ id, r }]; `links`: [{ a, b, weight }] (id). Le bolle già presenti mantengono posizione e velocità.
  function setGraph(items, links, { width = 1000, height = 700 } = {}) {
    const previous = byId
    nodes = items.map((item) => {
      const old = previous.get(item.id)
      if (old) { old.r = item.r; return old }
      return {
        id: item.id, r: item.r,
        x: (random() - 0.5) * width * 0.7, y: (random() - 0.5) * height * 0.7,
        vx: 0, vy: 0, phase: random() * TAU, pinned: false, degree: 0,
      }
    })
    byId = new Map(nodes.map((node) => [node.id, node]))
    edges = links
      .filter((link) => byId.has(link.a) && byId.has(link.b) && link.a !== link.b)
      .map((link) => ({ a: byId.get(link.a), b: byId.get(link.b), weight: Math.min(1, Math.max(0.05, Number(link.weight) || 0.5)) }))
    for (const node of nodes) node.degree = 0
    for (const edge of edges) { edge.a.degree += 1; edge.b.degree += 1 }
  }

  // `top`: fascia in alto che resta libera (la barra di ricerca): le bolle non vi galleggiano sotto.
  function step(rawDt, { width = 1000, height = 700, top = 0 } = {}) {
    const dt = Math.min(0.05, Math.max(0, rawDt))
    if (!dt || !nodes.length || frozen) return
    time += dt
    const halfW = width / 2
    const halfH = height / 2
    const ax = new Float64Array(nodes.length)
    const ay = new Float64Array(nodes.length)

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i]
        const b = nodes[j]
        let dx = b.x - a.x
        let dy = b.y - a.y
        let d2 = dx * dx + dy * dy
        if (d2 < 1e-4) { dx = random() - 0.5; dy = random() - 0.5; d2 = dx * dx + dy * dy + 1e-4 }
        const d = Math.sqrt(d2)
        const gap = a.r + b.r + 26
        let push = REPULSION / (d2 + 900)
        if (d < gap) push += (gap - d) * 14
        const fx = (dx / d) * push
        const fy = (dy / d) * push
        ax[i] -= fx; ay[i] -= fy
        ax[j] += fx; ay[j] += fy
      }
    }

    for (const edge of edges) {
      const i = nodes.indexOf(edge.a)
      const j = nodes.indexOf(edge.b)
      const dx = edge.b.x - edge.a.x
      const dy = edge.b.y - edge.a.y
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      // Più sono affini, più stanno vicine.
      const rest = edge.a.r + edge.b.r + 90 + (1 - edge.weight) * 170
      const pull = (d - rest) * SPRING * (0.4 + edge.weight * 0.6)
      const fx = (dx / d) * pull
      const fy = (dy / d) * pull
      ax[i] += fx; ay[i] += fy
      ax[j] -= fx; ay[j] -= fy
    }

    nodes.forEach((node, i) => {
      if (node.pinned) { node.vx = 0; node.vy = 0; return }
      if (node.degree > 0) {
        ax[i] -= node.x * GRAVITY
        ay[i] -= node.y * GRAVITY
      } else {
        // Nessuna connessione: una deriva lenta e continua, senza meta.
        if (wandering) {
          ax[i] += Math.cos(time * 0.31 + node.phase) * WANDER
          ay[i] += Math.sin(time * 0.23 + node.phase * 1.7) * WANDER
        }
        ax[i] -= node.x * 0.015
        ay[i] -= node.y * 0.015
      }
      // Bordi dello spazio: una spinta morbida verso l'interno.
      const limitX = halfW - node.r - 12
      const limitBottom = halfH - node.r - 12
      const limitTop = -halfH + top + node.r + 12
      if (node.x > limitX) ax[i] -= (node.x - limitX) * WALL
      if (node.x < -limitX) ax[i] -= (node.x + limitX) * WALL
      if (node.y > limitBottom) ay[i] -= (node.y - limitBottom) * WALL
      if (node.y < limitTop) ay[i] -= (node.y - limitTop) * WALL

      const damping = Math.exp(-(node.degree > 0 ? 2.4 : 1.1) * dt)
      node.vx = (node.vx + ax[i] * dt) * damping
      node.vy = (node.vy + ay[i] * dt) * damping
      const speed = Math.hypot(node.vx, node.vy)
      const cap = node.degree > 0 ? MAX_SPEED : 46
      if (speed > cap) { node.vx *= cap / speed; node.vy *= cap / speed }
      node.x += node.vx * dt
      node.y += node.vy * dt
    })
  }

  return {
    setGraph,
    step,
    get nodes() { return nodes },
    get edges() { return edges },
    get(id) { return byId.get(id) || null },
    pin(id, x, y) { const node = byId.get(id); if (!node) return; node.pinned = true; node.x = x; node.y = y; node.vx = 0; node.vy = 0 },
    release(id) { const node = byId.get(id); if (node) node.pinned = false },
    // Senza movimento (preferenza di sistema): si lascia assestare la rete e le bolle libere non vagano più.
    setWander(value) { wandering = Boolean(value) },
    // Ferma del tutto la simulazione (le bolle fissate dall'utente si spostano comunque).
    freeze(value = true) { frozen = Boolean(value); if (frozen) for (const node of nodes) { node.vx = 0; node.vy = 0 } },
    settle(steps = 240, bounds) { for (let k = 0; k < steps; k += 1) step(1 / 60, bounds) },
    nodeAt(x, y, slack = 0) {
      let best = null
      let bestDistance = Infinity
      for (const node of nodes) {
        const distance = Math.hypot(node.x - x, node.y - y)
        if (distance <= node.r + slack && distance < bestDistance) { best = node; bestDistance = distance }
      }
      return best
    },
  }
}
