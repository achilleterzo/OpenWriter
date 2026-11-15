const LAYOUT_LIMIT = 400
const MAX_NODES = 2000
const round = (value) => Math.round(value * 10) / 10

/**
 * Unisce le posizioni di alcune bolle del grafo a quelle già ricordate di uno spazio di lavoro. È la stessa unione di `saveLayout` (src/lib/graphLayoutStore.js),
 * ma fatta qui, dal nucleo, in un passo solo: due finestre che salvano insieme non si sovrascrivono perché nessuna rilegge, unisce e riscrive per conto suo.
 *   raw    il valore salvato (testo JSON) o null
 *   nodes  [{ id, x, y, z }]: chi non ha coordinate valide si salta
 * → il nuovo valore (testo JSON): le posizioni dei nodi sono riscritte in coda, e se si supera `limit` cadono le più vecchie.
 */
function mergeLayout(raw, nodes, limit = LAYOUT_LIMIT) {
  let merged = {}
  try {
    const parsed = JSON.parse(raw || '{}')
    for (const [id, at] of Object.entries(parsed && typeof parsed === 'object' ? parsed : {})) {
      if (at && Number.isFinite(at.x) && Number.isFinite(at.y)) merged[id] = { x: at.x, y: at.y, z: Number.isFinite(at.z) ? at.z : 0 }
    }
  } catch { merged = {} }
  for (const node of (Array.isArray(nodes) ? nodes : []).slice(0, MAX_NODES)) {
    if (!node || typeof node.id !== 'string' || !Number.isFinite(node.x) || !Number.isFinite(node.y)) continue
    delete merged[node.id]
    merged[node.id] = { x: round(node.x), y: round(node.y), z: round(Number.isFinite(node.z) ? node.z : 0) }
  }
  const ids = Object.keys(merged)
  for (const id of ids.slice(0, Math.max(0, ids.length - limit))) delete merged[id]
  return JSON.stringify(merged)
}

module.exports = { mergeLayout, LAYOUT_LIMIT }
