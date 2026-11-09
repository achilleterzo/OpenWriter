/**
 * Il grafo dei progetti della Home: quali progetti si somigliano abbastanza da collegarsi.
 *
 * I progetti che condividono la conoscenza si vedono tutti tra loro, quindi "condividono" non basta a disegnare una linea (sarebbe un groviglio completo).
 * Le linee uniscono invece ogni progetto ai pochi più affini per significato: il coseno tra i loro vettori medi (vedi `projectCentroids` in knowledge-index.cjs).
 * I coseni dei modelli di testo stanno in un intervallo stretto, quindi la soglia è relativa: contano solo le coppie sopra la mediana di tutte le coppie.
 * Senza vettori (modello non installato, progetti mai indicizzati) si ripiega su un legame uniforme tra chi condivide: `approximate`.
 */

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0
  let dot = 0
  for (let k = 0; k < a.length; k += 1) dot += a[k] * b[k]
  return dot
}

// nodes: [{ id, vector: Float32Array | null }] dei soli progetti che condividono. → [{ a, b, weight }] con weight in (0, 1], una sola volta per coppia.
function affinityEdges(nodes, { perNode = 3, minPairs = 1 } = {}) {
  const withVector = nodes.filter((node) => node.vector && node.vector.length)
  if (withVector.length < 2) return []
  const pairs = []
  for (let i = 0; i < withVector.length; i += 1) {
    for (let j = i + 1; j < withVector.length; j += 1) pairs.push({ a: withVector[i].id, b: withVector[j].id, similarity: cosine(withVector[i].vector, withVector[j].vector) })
  }
  if (pairs.length < minPairs) return []
  const sorted = pairs.map((pair) => pair.similarity).sort((x, y) => x - y)
  // Con due soli progetti non c'è un termine di confronto: la mediana coincide con l'unica coppia e la tiene.
  const median = sorted.length === 1 ? sorted[0] - 1e-9 : sorted[Math.floor(sorted.length / 2)]
  const chosen = new Map()
  for (const node of withVector) {
    pairs
      .filter((pair) => (pair.a === node.id || pair.b === node.id) && pair.similarity > median)
      .sort((x, y) => y.similarity - x.similarity)
      .slice(0, Math.max(1, perNode))
      .forEach((pair) => chosen.set(`${pair.a}\u0000${pair.b}`, pair))
  }
  const kept = [...chosen.values()]
  if (!kept.length) return []
  const low = Math.min(...kept.map((pair) => pair.similarity))
  const high = Math.max(...kept.map((pair) => pair.similarity))
  const span = high - low
  return kept
    .map((pair) => ({ a: pair.a, b: pair.b, weight: span > 1e-9 ? 0.25 + 0.75 * ((pair.similarity - low) / span) : 0.6 }))
    .sort((x, y) => y.weight - x.weight)
}

// Senza significato: pochi progetti si uniscono tutti tra loro, molti in anello (non si finge una vicinanza che non si conosce).
function uniformEdges(ids, { cliqueUpTo = 5 } = {}) {
  const list = [...ids]
  const edges = []
  if (list.length < 2) return edges
  if (list.length <= cliqueUpTo) {
    for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) edges.push({ a: list[i], b: list[j], weight: 0.3 })
    return edges
  }
  for (let i = 0; i < list.length; i += 1) edges.push({ a: list[i], b: list[(i + 1) % list.length], weight: 0.3 })
  return edges
}

/**
 * I vettori medi dei progetti che condividono, con una cache. Un centro calcolato mentre i vettori del progetto sono solo in parte pronti è provvisorio: si usa, ma non si
 * ricorda (la firma della cache, file e data dell'indice, non cambierebbe a vettori finiti e il progetto resterebbe "a metà").
 *
 * `nodes`: [{ path, chunks, updatedAt }]; `cache`: Map chiave → { signature, vector }; `key(path)`; `centroids(paths)` → { [chiave]: { vector } };
 * `status(path)` → { total, embedded } (i testi del progetto e quanti hanno già il vettore) o null.
 * → { vectors: Map(path → vector), pending: Set(path) } (`pending`: vettori ancora da finire).
 */
async function collectVectors({ nodes, model, cache, key, centroids, status }) {
  const vectors = new Map()
  const pending = new Set()
  if (!model || !nodes.length) return { vectors, pending }
  const statuses = new Map()
  for (const node of nodes) statuses.set(node.path, await status(node.path))
  const complete = (node) => {
    const state = statuses.get(node.path)
    return Boolean(state) && state.total > 0 && state.embedded >= state.total
  }
  const signatureOf = (node) => `${model}|${node.chunks}|${node.updatedAt}`
  const stale = nodes.filter((node) => cache.get(key(node.path))?.signature !== signatureOf(node))
  const fresh = new Map()
  if (stale.length) {
    const found = await centroids(stale.map((node) => node.path))
    for (const node of stale) {
      const entry = found[key(node.path)]
      if (!entry) { cache.delete(key(node.path)); continue }
      fresh.set(node.path, entry.vector)
      if (complete(node)) cache.set(key(node.path), { signature: signatureOf(node), vector: entry.vector })
      else cache.delete(key(node.path))
    }
  }
  for (const node of nodes) {
    const vector = fresh.get(node.path) || cache.get(key(node.path))?.vector
    if (vector) vectors.set(node.path, vector)
    if (!complete(node)) pending.add(node.path)
  }
  return { vectors, pending }
}

// Il padre di ogni progetto dell'elenco: il progetto più interno la cui cartella ne contiene un'altra (un sotto-progetto), altrimenti null. I progetti mancanti non contano.
// → Map percorso → percorso del padre | null. `isSameOrInside(radice, destinazione)` e `samePath` vengono da path-compare.cjs.
function parentProjects(projects, { isSameOrInside, samePath }) {
  const parents = new Map()
  for (const node of projects) {
    let parent = null
    if (!node.missing) {
      for (const other of projects) {
        if (other === node || other.missing || samePath(other.path, node.path) || !isSameOrInside(other.path, node.path)) continue
        if (!parent || isSameOrInside(parent.path, other.path)) parent = other
      }
    }
    parents.set(node.path, parent ? parent.path : null)
  }
  return parents
}

module.exports = { cosine, affinityEdges, uniformEdges, collectVectors, parentProjects }
