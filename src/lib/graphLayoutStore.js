/**
 * Le posizioni dei progetti nella rete della Home, ricordate tra un avvio e l'altro: la rete è stabile, le bolle stanno dove le hai lasciate (o dove si sono
 * disposte la prima volta) e si rimettono in movimento solo se le sposti tu o chiedi di ricalcolare. Vive nel browser dell'app (localStorage), per utente:
 * non fa parte dei progetti. Ogni accesso è protetto: senza archivio (o con dati rovinati) la rete si dispone da sé come la prima volta.
 *
 * Ogni spazio di lavoro (workspace) ha la sua disposizione: «Tutti» (`'all'`) tiene la chiave di sempre, gli altri una chiave con il loro id. Il `storage` è il primo
 * argomento opzionale (per le prove); `workspace` il successivo.
 *
 *   loadLayout(storage?, workspace?)             → { [percorso progetto]: { x, y, z } }
 *   saveLayout(nodes, storage?, workspace?)      unisce le posizioni di [{ id, x, y, z }] a quelle già ricordate (si tengono al massimo LIMIT progetti: i più vecchi cadono)
 *   clearLayout(storage?, workspace?)            dimentica la disposizione di quello spazio (ricalcolo)
 *   pruneLayouts(validIds, storage?)             toglie le disposizioni degli spazi che non esistono più
 */
export const LAYOUT_KEY = 'openwriter.graphLayout.v1'
export const LAYOUT_LIMIT = 400

const defaultStorage = () => { try { return globalThis.localStorage || null } catch { return null } }
const round = (value) => Math.round(value * 10) / 10
// «Tutti» (o nessuno spazio) ha la chiave di sempre: chi non usa gli spazi di lavoro non perde nulla.
export const layoutKeyFor = (workspace) => (!workspace || workspace === 'all' ? LAYOUT_KEY : `${LAYOUT_KEY}:${workspace}`)

export function loadLayout(storage = defaultStorage(), workspace = 'all') {
  try {
    const parsed = JSON.parse(storage?.getItem(layoutKeyFor(workspace)) || '{}')
    const clean = {}
    for (const [id, at] of Object.entries(parsed && typeof parsed === 'object' ? parsed : {})) {
      if (at && Number.isFinite(at.x) && Number.isFinite(at.y)) clean[id] = { x: at.x, y: at.y, z: Number.isFinite(at.z) ? at.z : 0 }
    }
    return clean
  } catch { return {} }
}

export function saveLayout(nodes, storage = defaultStorage(), workspace = 'all') {
  try {
    const merged = loadLayout(storage, workspace)
    for (const node of nodes) {
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) continue
      // Riscritta in coda: chi non si sposta più da tempo è il primo a cadere quando si supera il limite.
      delete merged[node.id]
      merged[node.id] = { x: round(node.x), y: round(node.y), z: round(Number.isFinite(node.z) ? node.z : 0) }
    }
    const ids = Object.keys(merged)
    for (const id of ids.slice(0, Math.max(0, ids.length - LAYOUT_LIMIT))) delete merged[id]
    storage?.setItem(layoutKeyFor(workspace), JSON.stringify(merged))
  } catch { /* archivio pieno o non disponibile: la rete si disporrà da sé la prossima volta */ }
}

export function clearLayout(storage = defaultStorage(), workspace = 'all') {
  try { storage?.removeItem(layoutKeyFor(workspace)) } catch { /* come sopra */ }
}

// Gli spazi di lavoro eliminati lasciano la loro disposizione nell'archivio: si toglie. «Tutti» non si tocca mai.
export function pruneLayouts(validIds, storage = defaultStorage()) {
  try {
    if (!storage) return
    const valid = new Set((validIds || []).map(String))
    const prefix = `${LAYOUT_KEY}:`
    const stale = []
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key && key.startsWith(prefix) && !valid.has(key.slice(prefix.length))) stale.push(key)
    }
    for (const key of stale) storage.removeItem(key)
  } catch { /* si ritenta alla prossima apertura */ }
}
