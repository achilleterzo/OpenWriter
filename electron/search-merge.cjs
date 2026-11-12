/**
 * Unisce i risultati di più ricerche dello stesso progetto-insieme: la domanda e i suoi sinonimi (vedi la Home, `projects:search`).
 * Un passaggio trovato da più termini compare una volta, con il termine che lo valorizza di più; i risultati si ordinano per pertinenza.
 *
 * `searches`: [{ term, original, results }] con la domanda per prima; ogni risultato ha `project`, `file`, `startLine` e, se c'è, `relevance` (0-1).
 * → [{ ...risultato, term }] (`term`: la parola cercata che ha portato il passaggio), al più `limit`.
 */
// La pertinenza di un passaggio trovato solo da un sinonimo o termine affine vale meno di quella di un passaggio che risponde alla domanda scritta dall'utente:
// ogni ricerca la misura da sé (chi contiene la parola vale almeno 0,6), quindi senza questo sconto un termine affine ("carta") eguaglierebbe la parola cercata ("Cartonio").
const RELATED_WEIGHT = 0.8

function mergeSearches(searches, { limit = 30 } = {}) {
  const best = new Map()
  let order = 0
  for (const { term, original, results } of searches) {
    for (const result of results) {
      const key = `${String(result.project).toLowerCase()}\u0000${result.file}\u0000${result.startLine}`
      const discounted = !original && result.relevance !== undefined ? { ...result, relevance: Math.round(result.relevance * RELATED_WEIGHT * 100) / 100 } : result
      const candidate = { ...discounted, term, original: Boolean(original), order: order += 1 }
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

// Evidenzia (tra « ») nell'estratto le parole della domanda, se l'estratto non ha già evidenziazioni (un passaggio trovato per significato non ne ha):
// senza accenti né maiuscole, e una parola cercata vale anche come inizio di parola (come nella ricerca per parole). Parole di 3+ lettere.
function markTerms(snippet, query) {
  const text = String(snippet ?? '')
  if (!text || text.includes('«')) return text
  const fold = (value) => String(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const words = [...new Set((String(query).match(/\p{L}+/gu) || []).map(fold).filter((word) => word.length >= 3))]
  if (!words.length) return text
  return text.replace(/\p{L}+/gu, (token) => { const folded = fold(token); return words.some((word) => folded.startsWith(word)) ? `«${token}»` : token })
}

module.exports = { mergeSearches, cleanTerms, markTerms }
