const { lex, normalizeNewlines } = require('./markdown-tokens.cjs')

/**
 * Immagini di un documento Markdown, trovate dall'analizzatore Markdown (gli stessi token dell'editor) e non da espressioni regolari:
 * restano fuori gli esempi dentro un blocco di codice o tra apici inversi, e le destinazioni con parentesi (`images/foto(1).png`), con
 * escape o tra `<…>` si leggono per intero. Lo usano lo spostamento di un documento (quali immagini lo seguono), l'esportazione con le
 * immagini incorporate e il salvataggio che trasforma i data: URI in file.
 */

// Destinazione dentro `![testo](destinazione "titolo")` (CommonMark): tra `<…>`, oppure senza spazi e con le parentesi bilanciate.
// Restituisce { from, to } nel testo `raw` dell'immagine (con gli eventuali `<>`), e `value` così com'è scritta; null per `![testo][rif]`.
function destinationSpan(raw) {
  if (!raw.startsWith('![')) return null
  let index = 2
  for (let depth = 1; index < raw.length && depth > 0; index += 1) {
    const char = raw[index]
    if (char === '\\') index += 1
    else if (char === '[') depth += 1
    else if (char === ']') depth -= 1
  }
  if (raw[index] !== '(') return null
  index += 1
  while (/\s/.test(raw[index] || '')) index += 1
  const from = index
  if (raw[index] === '<') {
    index += 1
    while (index < raw.length && raw[index] !== '>') index += raw[index] === '\\' ? 2 : 1
    if (raw[index] !== '>') return null
    return { from, to: index + 1, value: raw.slice(from + 1, index).replace(/\\([<>\\])/g, '$1') }
  }
  let depth = 0
  while (index < raw.length) {
    const char = raw[index]
    if (char === '\\') { index += 2; continue }
    if (/\s/.test(char)) break
    if (char === '(') depth += 1
    else if (char === ')') { if (depth === 0) break; depth -= 1 }
    index += 1
  }
  return { from, to: index, value: raw.slice(from, index).replace(/\\([()\\])/g, '$1') }
}

const balancedParentheses = (value) => {
  let depth = 0
  for (const char of value) {
    if (char === '(') depth += 1
    else if (char === ')') { depth -= 1; if (depth < 0) return false }
  }
  return depth === 0
}

// Destinazione da scrivere nel Markdown (stessa regola di src/lib/markdownSyntax.js): semplice se non ha nulla di speciale (spazi, `<`, `>`, `\`,
// parentesi non bilanciate), altrimenti tra `<…>` con l'escape di `\`, `<` e `>`.
function formatDestination(value) {
  const text = String(value ?? '').replace(/[\r\n]+/g, '')
  if (text !== '' && /^[^\s<>\\\u0000-\u001f]+$/.test(text) && balancedParentheses(text)) return text
  return `<${text.replace(/[\\<>]/g, '\\$&')}>`
}

/**
 * Tutte le immagini del documento, in ordine: { href, alt, title, raw, start, end, destination }.
 * `start`/`end` (nel testo con gli a capo normalizzati) e `destination` valgono solo se l'immagine si è potuta collocare nel sorgente; altrimenti
 * sono null (per esempio un'immagine dentro un blocco citazione su più righe): chi riscrive il testo le salta, chi cerca i riferimenti le conta.
 */
function findImages(markdown) {
  const { source, tokens } = lex(markdown)
  const images = []

  const place = (token, cursor, limit) => {
    if (!token.raw) return null
    const index = source.indexOf(token.raw, cursor)
    return index !== -1 && index + token.raw.length <= limit ? index : null
  }

  // Scorre i token di un blocco (o di una riga) nell'ordine del sorgente; `from`-`to` è l'intervallo del genitore. Restituisce il cursore finale.
  function walk(list, from, to, parentPlaced) {
    let cursor = from
    for (const token of list || []) {
      const index = parentPlaced ? place(token, cursor, to) : null
      const end = index === null ? null : index + token.raw.length
      if (token.type === 'image') {
        const span = index === null ? null : destinationSpan(token.raw)
        images.push({ href: token.href, alt: token.text, title: token.title || '', raw: token.raw, start: index, end, destination: span && { from: index + span.from, to: index + span.to, value: span.value } })
      } else if (token.type === 'list') {
        let itemCursor = index === null ? 0 : index
        for (const item of token.items) {
          const itemIndex = index === null ? null : place(item, itemCursor, end)
          walk(item.tokens, itemIndex ?? 0, itemIndex === null ? 0 : itemIndex + item.raw.length, itemIndex !== null)
          if (itemIndex !== null) itemCursor = itemIndex + item.raw.length
        }
      } else if (token.type === 'table') {
        let cellCursor = index === null ? 0 : index
        for (const cell of [...token.header, ...token.rows.flat()]) cellCursor = walk(cell.tokens, cellCursor, index === null ? 0 : end, index !== null)
      } else if (token.tokens?.length) {
        walk(token.tokens, index ?? 0, end ?? 0, index !== null)
      }
      if (index !== null) cursor = end
    }
    return cursor
  }
  walk(tokens, 0, source.length, true)
  return images
}

/**
 * Riscrive le destinazioni delle immagini: `change(image)` restituisce la nuova destinazione (testo, da scrivere con le regole del Markdown)
 * oppure null per lasciarla com'è. Il resto del documento resta identico, anche gli a capo (CRLF).
 */
function rewriteImageDestinations(markdown, change) {
  const original = String(markdown ?? '')
  const crlf = original.includes('\r\n')
  let text = normalizeNewlines(original)
  const edits = []
  for (const image of findImages(original)) {
    if (!image.destination) continue
    const value = change(image)
    if (typeof value === 'string') edits.push({ from: image.destination.from, to: image.destination.to, text: formatDestination(value) })
  }
  for (const edit of edits.sort((left, right) => right.from - left.from)) text = text.slice(0, edit.from) + edit.text + text.slice(edit.to)
  return crlf ? text.replace(/\n/g, '\r\n') : text
}

module.exports = { findImages, rewriteImageDestinations, formatDestination, destinationSpan }
