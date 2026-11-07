/**
 * Le posizioni dei progetti nella rete della Home, ricordate tra un avvio e l'altro: la rete è stabile, le bolle stanno dove le hai lasciate (o dove si sono
 * disposte la prima volta) e si rimettono in movimento solo se le sposti tu o chiedi di ricalcolare. Vive nel browser dell'app (localStorage), per utente:
 * non fa parte dei progetti. Ogni accesso è protetto: senza archivio (o con dati rovinati) la rete si dispone da sé come la prima volta.
 *
 *   loadLayout(storage?)               → { [percorso progetto]: { x, y, z } }
 *   saveLayout(nodes, storage?)        unisce le posizioni di [{ id, x, y, z }] a quelle già ricordate (si tengono al massimo LIMIT progetti: i più vecchi cadono)
 *   clearLayout(storage?)              dimentica tutto (ricalcolo)
 */
export const LAYOUT_KEY = 'openwriter.graphLayout.v1'
export const LAYOUT_LIMIT = 400

const defaultStorage = () => { try { return globalThis.localStorage || null } catch { return null } }
const round = (value) => Math.round(value * 10) / 10

export function loadLayout(storage = defaultStorage()) {
  try {
    const parsed = JSON.parse(storage?.getItem(LAYOUT_KEY) || '{}')
    const clean = {}
    for (const [id, at] of Object.entries(parsed && typeof parsed === 'object' ? parsed : {})) {
      if (at && Number.isFinite(at.x) && Number.isFinite(at.y)) clean[id] = { x: at.x, y: at.y, z: Number.isFinite(at.z) ? at.z : 0 }
    }
    return clean
  } catch { return {} }
}

export function saveLayout(nodes, storage = defaultStorage()) {
  try {
    const merged = loadLayout(storage)
    for (const node of nodes) {
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) continue
      // Riscritta in coda: chi non si sposta più da tempo è il primo a cadere quando si supera il limite.
      delete merged[node.id]
      merged[node.id] = { x: round(node.x), y: round(node.y), z: round(Number.isFinite(node.z) ? node.z : 0) }
    }
    const ids = Object.keys(merged)
    for (const id of ids.slice(0, Math.max(0, ids.length - LAYOUT_LIMIT))) delete merged[id]
    storage?.setItem(LAYOUT_KEY, JSON.stringify(merged))
  } catch { /* archivio pieno o non disponibile: la rete si disporrà da sé la prossima volta */ }
}

export function clearLayout(storage = defaultStorage()) {
  try { storage?.removeItem(LAYOUT_KEY) } catch { /* come sopra */ }
}
