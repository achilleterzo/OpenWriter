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
const SATELLITES_PER_RING = 6
const SATELLITE_SPRING = 90
// Profondità: la rete ha un volume. Le bolle pesanti (molti dati e molte connessioni) stanno vicine al piano centrale e si muovono poco; le leggere si dispongono
// in profondità e vengono trascinate da quelle che pesano di più, come i corpi celesti.
const Z_SPREAD = 230
const Z_LIMIT = 300
const Z_SPRING = 1.1

// Imparentate (una dentro l'altra, a qualunque livello) o sorelle: non si respingono.
function related(a, b) {
  if (a.parent && a.parent === b.parent) return true
  for (let up = a.parent; up; up = up.parent) if (up === b) return true
  for (let up = b.parent; up; up = up.parent) if (up === a) return true
  return false
}

export function createGraphSim({ seed = 7, wander = true } = {}) {
  const random = mulberry32(seed)
  let nodes = []
  let edges = []
  let byId = new Map()
  let time = 0
  let wandering = wander
  let frozen = false

  // `items`: [{ id, r, parent?, data?, at? }] (`at`: { x, y, z } la posizione ricordata di una bolla nuova: parte da lì invece che da un punto a caso) (`data`: 0-1, quanto contiene il progetto: con le connessioni fa la massa); `links`: [{ a, b, weight }] (id). Le bolle già presenti mantengono posizione e velocità.
  // `parent`: l'id del progetto che contiene questo (un sotto-progetto): la bolla è un satellite e gira intorno al padre.
  function setGraph(items, links, { width = 1000, height = 700 } = {}) {
    const previous = byId
    nodes = items.map((item) => {
      const old = previous.get(item.id)
      if (old) { old.r = item.r; old.data = item.data || 0; return old }
      return {
        id: item.id, r: item.r,
        x: item.at ? item.at.x : (random() - 0.5) * width * 0.7, y: item.at ? item.at.y : (random() - 0.5) * height * 0.7, placed: Boolean(item.at),
        vx: 0, vy: 0, phase: random() * TAU, pinned: false, degree: 0, fresh: true,
        z: item.at && Number.isFinite(item.at.z) ? item.at.z : (random() * 2 - 1) * Z_SPREAD * 0.5, vz: 0, zSlot: random() * 2 - 1, data: item.data || 0, mass: 1, inertia: 1, zSpread: Z_SPREAD,
      }
    })
    byId = new Map(nodes.map((node) => [node.id, node]))
    // Satelliti: il padre deve esistere, non essere la bolla stessa e non formare un giro (A dentro B dentro A).
    const wanted = new Map(items.map((item) => [item.id, item.parent]))
    const loops = (id) => { const seen = new Set([id]); let current = wanted.get(id); while (current) { if (seen.has(current)) return true; seen.add(current); current = wanted.get(current) } return false }
    for (const node of nodes) { node.parent = null; node.satellites = []; node.halo = node.r }
    for (const node of nodes) {
      const parent = wanted.get(node.id)
      if (parent && parent !== node.id && byId.has(parent) && !loops(node.id)) node.parent = byId.get(parent)
    }
    for (const node of nodes) {
      if (!node.parent) continue
      const siblings = node.parent.satellites
      const index = siblings.length
      siblings.push(node)
      const ring = Math.floor(index / SATELLITES_PER_RING)
      node.orbit = node.parent.r + node.r + 8 + ring * (node.r * 2 + 6)
      node.spin = (index % 2 ? -1 : 1) * (0.28 + 0.07 * ring)
    }
    for (const node of nodes) {
      if (!node.satellites.length) continue
      node.satellites.forEach((satellite, index) => {
        const count = Math.min(SATELLITES_PER_RING, node.satellites.length - Math.floor(index / SATELLITES_PER_RING) * SATELLITES_PER_RING)
        // Un satellite con una posizione ricordata parte dall'angolo in cui si trova; uno nuovo si mette in orbita.
        if (satellite.angle === undefined) satellite.angle = satellite.placed ? Math.atan2(satellite.y - node.y, satellite.x - node.x) : (TAU * (index % SATELLITES_PER_RING)) / Math.max(1, count) + node.phase
        node.halo = Math.max(node.halo, satellite.orbit + satellite.r)
      })
    }
    // Un satellite nuovo parte già in orbita, non in un punto a caso dello spazio.
    for (const node of nodes) {
      if (node.parent && node.fresh && !node.placed) { node.x = node.parent.x + Math.cos(node.angle) * node.orbit; node.y = node.parent.y + Math.sin(node.angle) * node.orbit }
      node.fresh = false
    }
    edges = links
      .filter((link) => byId.has(link.a) && byId.has(link.b) && link.a !== link.b)
      .map((link) => ({ a: byId.get(link.a), b: byId.get(link.b), weight: Math.min(1, Math.max(0.05, Number(link.weight) || 0.5)) }))
    for (const node of nodes) node.degree = 0
    for (const edge of edges) { edge.a.degree += 1; edge.b.degree += 1 }
    // La massa: i dati del progetto e le sue connessioni. Più è grande, più il corpo è inerte (si lascia poco spostare), più sta vicino al centro e più attira gli altri.
    for (const node of nodes) {
      node.mass = Math.min(9, 1 + node.data * 5 + node.degree * 0.6)
      node.inertia = Math.pow(node.mass, 0.75)
      node.zSpread = Z_SPREAD * (1 - Math.min(1, (node.mass - 1) / 7))
    }
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
    const az = new Float64Array(nodes.length)

    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i]
        const b = nodes[j]
        // Padre e satelliti (e i satelliti tra loro) hanno già il loro posto sull'orbita.
        if (related(a, b)) continue
        let dx = b.x - a.x
        let dy = b.y - a.y
        let d2 = dx * dx + dy * dy
        if (d2 < 1e-4) { dx = random() - 0.5; dy = random() - 0.5; d2 = dx * dx + dy * dy + 1e-4 }
        const d = Math.sqrt(d2)
        const gap = a.halo + b.halo + 26
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
      const dz = edge.b.z - edge.a.z
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1
      // Più sono affini, più stanno vicine.
      const rest = edge.a.r + edge.b.r + 90 + (1 - edge.weight) * 170
      const pull = (d - rest) * SPRING * (0.4 + edge.weight * 0.6)
      const fx = (dx / d) * pull
      const fy = (dy / d) * pull
      const fz = (dz / d) * pull
      ax[i] += fx; ay[i] += fy; az[i] += fz
      ax[j] -= fx; ay[j] -= fy; az[j] -= fz
    }

    nodes.forEach((node, i) => {
      if (node.pinned) { node.vx = 0; node.vy = 0; node.vz = 0; return }
      // La spinta di molle e repulsione si divide per l'inerzia: le bolle leggere si spostano molto, quelle pesanti poco e trascinano le altre.
      ax[i] /= node.inertia; ay[i] /= node.inertia; az[i] /= node.inertia
      if (node.parent) {
        // Satellite: gira intorno al padre (da fermi, nel punto in cui sono) e vi resta agganciato con una molla rigida.
        if (wandering) node.angle += node.spin * dt
        ax[i] += (node.parent.x + Math.cos(node.angle) * node.orbit - node.x) * SATELLITE_SPRING
        ay[i] += (node.parent.y + Math.sin(node.angle) * node.orbit - node.y) * SATELLITE_SPRING
        az[i] += (node.parent.z - node.z) * SATELLITE_SPRING
      } else if (node.degree > 0) {
        ax[i] -= node.x * GRAVITY
        ay[i] -= node.y * GRAVITY
        az[i] += (node.zSlot * node.zSpread - node.z) * Z_SPRING
      } else {
        // Nessuna connessione: una deriva lenta e continua, senza meta.
        if (wandering) {
          ax[i] += Math.cos(time * 0.31 + node.phase) * WANDER
          ay[i] += Math.sin(time * 0.23 + node.phase * 1.7) * WANDER
          az[i] += Math.sin(time * 0.17 + node.phase * 2.3) * WANDER * 0.7
        }
        ax[i] -= node.x * 0.015
        ay[i] -= node.y * 0.015
        az[i] += (node.zSlot * node.zSpread - node.z) * Z_SPRING * 0.4
      }
      if (node.z > Z_LIMIT) az[i] -= (node.z - Z_LIMIT) * WALL
      if (node.z < -Z_LIMIT) az[i] -= (node.z + Z_LIMIT) * WALL
      // Bordi dello spazio: una spinta morbida verso l'interno.
      const limitX = halfW - node.r - 12
      const limitBottom = halfH - node.r - 12
      const limitTop = -halfH + top + node.r + 12
      if (node.x > limitX) ax[i] -= (node.x - limitX) * WALL
      if (node.x < -limitX) ax[i] -= (node.x + limitX) * WALL
      if (node.y > limitBottom) ay[i] -= (node.y - limitBottom) * WALL
      if (node.y < limitTop) ay[i] -= (node.y - limitTop) * WALL

      const damping = Math.exp(-(node.parent ? 9 : node.degree > 0 ? 2.4 : 1.1) * dt)
      node.vx = (node.vx + ax[i] * dt) * damping
      node.vy = (node.vy + ay[i] * dt) * damping
      node.vz = (node.vz + az[i] * dt) * damping
      const speed = Math.hypot(node.vx, node.vy, node.vz)
      const cap = node.degree > 0 || node.parent ? MAX_SPEED : 46
      if (speed > cap) { node.vx *= cap / speed; node.vy *= cap / speed; node.vz *= cap / speed }
      node.x += node.vx * dt
      node.y += node.vy * dt
      node.z += node.vz * dt
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
    freeze(value = true) { frozen = Boolean(value); if (frozen) for (const node of nodes) { node.vx = 0; node.vy = 0; node.vz = 0 } },
    // L'orbita dei satelliti come puro effetto visivo, anche a rete ferma: ogni satellite avanza sul suo giro e si rimette sull'orbita del padre (che può essere a sua volta
    // un satellite: si va dai padri ai figli). Non muove nient'altro, quindi la disposizione resta quella ricordata.
    orbit(rawDt) {
      const dt = Math.min(0.05, Math.max(0, rawDt))
      if (!dt) return
      const level = (node) => { let n = 0; for (let up = node.parent; up; up = up.parent) n += 1; return n }
      const satellites = nodes.filter((node) => node.parent).sort((a, b) => level(a) - level(b))
      for (const node of satellites) {
        if (node.pinned) continue
        node.angle += node.spin * dt
        node.x = node.parent.x + Math.cos(node.angle) * node.orbit
        node.y = node.parent.y + Math.sin(node.angle) * node.orbit
        node.z = node.parent.z
        node.vx = 0; node.vy = 0; node.vz = 0
      }
    },
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
