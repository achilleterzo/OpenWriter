/**
 * Unisce i risultati di più ricerche dello stesso progetto-insieme: la domanda e i suoi sinonimi (vedi la Home, `projects:search`).
 * Un passaggio trovato da più termini compare una volta, con il termine che lo valorizza di più; i risultati si ordinano per pertinenza.
 *
 * `searches`: [{ term, original, results }] con la domanda per prima; ogni risultato ha `project`, `file`, `startLine` e, se c'è, `relevance` (0-1).
 * → [{ ...risultato, term }] (`term`: la parola cercata che ha portato il passaggio), al più `limit`.
 */
function mergeSearches(searches, { limit = 30 } = {}) {
  const best = new Map()
  let order = 0
  for (const { term, original, results } of searches) {
    for (const result of results) {
      const key = `${String(result.project).toLowerCase()}\u0000${result.file}\u0000${result.startLine}`
      const candidate = { ...result, term, original: Boolean(original), order: order += 1 }
      const current = best.get(key)
      const score = (entry) => (entry.relevance ?? 0) + (entry.original ? 1e-6 : 0)
      if (!current || score(candidate) > score(current)) best.set(key, candidate)
    }
  }
  return [...best.values()]
    .sort((a, b) => (b.relevance ?? 0) - (a.relevance ?? 0) || Number(b.original) - Number(a.original) || a.order - b.order)
    .slice(0, limit)
    .map(({ original: _original, order: _order, ...result }) => result)
}

// I termini chiesti dal chiamante: puliti, senza doppioni né la domanda stessa, al più `max`.
function cleanTerms(terms, query, max = 8) {
  const fold = (value) => String(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()
  const seen = new Set([fold(query)])
  const result = []
  for (const raw of Array.isArray(terms) ? terms : []) {
    const term = String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)
    const key = fold(term)
    if (!term || seen.has(key)) continue
    seen.add(key)
    result.push(term)
    if (result.length >= max) break
  }
  return result
}

module.exports = { mergeSearches, cleanTerms }
