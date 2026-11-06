/**
 * Espansione di una ricerca con sinonimi e termini affini, chiesti al modello linguistico configurato (come farebbe un agente prima di cercare).
 * Il modello vede solo la parola o la frase cercata, mai i documenti. Qui stanno le parti pure: il messaggio da mandare e la lettura della risposta.
 */
export const MAX_TERMS = 8
const MAX_TERM_WORDS = 4
const MAX_TERM_CHARS = 40

export function expansionMessages(query) {
  return [
    {
      role: 'system',
      content: [
        'You expand search queries for a document search engine over personal writings (articles, essays, fiction, notes, technical documents), mostly in Italian and English.',
        `Given a word or a short phrase, list up to ${MAX_TERMS} synonyms, near-synonyms and closely related terms that a passage on the same subject could contain instead of the query itself.`,
        'Write them in the SAME language as the query; if the query is not English, add at most two English equivalents. Include the other forms of the word that differ much (noun, adjective, verb). One or two words each, never a sentence, no explanations, no repetition of the query.',
        'Reply ONLY with a JSON array of strings, nothing else. Example for "feroce": ["aggressivo", "violento", "brutale", "crudele", "ferocia", "selvaggio", "fierce"].',
      ].join('\n'),
    },
    { role: 'user', content: String(query).trim() },
  ]
}

const fold = (value) => String(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim()

/**
 * Legge la risposta del modello: una lista JSON (anche dentro testo o ```), oppure una per riga / separata da virgole, con elenchi puntati o numerati.
 * Toglie i doppioni, la domanda stessa e ciò che non sembra un termine (frasi lunghe). → al più MAX_TERMS stringhe.
 */
export function parseExpansion(reply, query = '') {
  const text = String(reply ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  let items = null
  const array = text.match(/\[[\s\S]*\]/)
  if (array) {
    try {
      const parsed = JSON.parse(array[0])
      if (Array.isArray(parsed)) items = parsed.filter((item) => typeof item === 'string')
    } catch { /* si prova il formato libero */ }
  }
  if (!items) {
    items = text
      .replace(/```[a-z]*/gi, '')
      .split(/[\n,;]+/)
      .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, ''))
  }
  const asked = fold(query)
  const seen = new Set([asked])
  const terms = []
  for (const raw of items) {
    const term = String(raw).replace(/^["'`“”‘’\s]+|["'`“”‘’.\s]+$/g, '').replace(/\s+/g, ' ')
    const key = fold(term)
    if (!term || term.length < 2 || term.length > MAX_TERM_CHARS || term.split(' ').length > MAX_TERM_WORDS || seen.has(key)) continue
    seen.add(key)
    terms.push(term)
    if (terms.length >= MAX_TERMS) break
  }
  return terms
}
