/**
 * Cerca e sostituisci in un testo semplice (il lettore testuale, `TextPane`). Funzioni pure: lavorano su stringhe e posizioni (indici nel testo), non sul DOM.
 *
 *   findMatches(text, { query, caseSensitive, wholeWord, regex }) → { matches: [{ from, to, groups }], error, truncated }
 *   replaceOne(text, match, replacement, { regex })               → { text, caret }       (caret: dove finisce il testo inserito)
 *   replaceAll(text, matches, replacement, { regex })             → { text, count }
 *   lineStarts(text) / lineOf(starts, position)                    posizioni di inizio riga e riga di una posizione (per i numeri di riga)
 *
 * Con `regex` la sostituzione ammette $1…$99, $& e $<nome>, $$ come in JavaScript; senza, il testo si inserisce com'è. Una corrispondenza vuota (es. `a*`) si salta.
 */
export const MAX_MATCHES = 5000

const WORD = '[\\w\\u00C0-\\u024F]'

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function buildPattern({ query, caseSensitive = false, wholeWord = false, regex = false }) {
  const source = regex ? query : escapeRegex(query)
  const body = wholeWord ? `(?<!${WORD})(?:${source})(?!${WORD})` : source
  return new RegExp(body, `g${caseSensitive ? '' : 'i'}m`)
}

export function findMatches(text, options) {
  if (!options?.query) return { matches: [], error: '', truncated: false }
  let pattern
  try { pattern = buildPattern(options) } catch (error) { return { matches: [], error: error.message, truncated: false } }
  const matches = []
  let truncated = false
  let found
  while ((found = pattern.exec(text)) !== null) {
    if (found[0] === '') { pattern.lastIndex += 1; continue }
    if (matches.length >= MAX_MATCHES) { truncated = true; break }
    matches.push({ from: found.index, to: found.index + found[0].length, groups: options.regex ? { list: [...found], named: found.groups || {} } : null })
  }
  return { matches, error: '', truncated }
}

// Il testo che sostituisce una corrispondenza: con le espressioni regolari si espandono $1, $&, $<nome>, $$.
function expand(replacement, match, text) {
  if (!match.groups) return replacement
  const { list, named } = match.groups
  return replacement.replace(/\$(\$|&|`|'|\d{1,2}|<[^>]*>)/g, (token, key) => {
    if (key === '$') return '$'
    if (key === '&') return list[0]
    if (key === '`') return text.slice(0, match.from)
    if (key === "'") return text.slice(match.to)
    if (key[0] === '<') return Object.keys(named).length ? (named[key.slice(1, -1)] ?? '') : token
    const index = Number(key)
    if (index >= 1 && index < list.length) return list[index] ?? ''
    const first = Number(key[0])
    return key.length === 2 && first >= 1 && first < list.length ? `${list[first] ?? ''}${key[1]}` : token
  })
}

export function replaceOne(text, match, replacement) {
  const inserted = expand(replacement, match, text)
  return { text: text.slice(0, match.from) + inserted + text.slice(match.to), caret: match.from + inserted.length }
}

export function replaceAll(text, matches, replacement) {
  let result = ''
  let cursor = 0
  for (const match of matches) {
    result += text.slice(cursor, match.from) + expand(replacement, match, text)
    cursor = match.to
  }
  return { text: result + text.slice(cursor), count: matches.length }
}

// Posizioni di inizio di ogni riga, e riga (da 0) in cui cade una posizione.
export function lineStarts(text) {
  const starts = [0]
  for (let index = text.indexOf('\n'); index !== -1; index = text.indexOf('\n', index + 1)) starts.push(index + 1)
  return starts
}

export function lineOf(starts, position) {
  let low = 0
  let high = starts.length - 1
  while (low < high) {
    const middle = (low + high + 1) >> 1
    if (starts[middle] <= position) low = middle; else high = middle - 1
  }
  return low
}
