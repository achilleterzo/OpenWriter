/**
 * Sintassi Markdown di link e immagini, scritta correttamente: destinazione, testo (alt) e titolo. Un semplice `<…>` attorno alla destinazione non basta:
 * dentro vanno protetti `\`, `<` e `>`, e un testo con `[`, `]` o un titolo con `"` romperebbero la riga (o cambierebbero il significato) se scritti così.
 * La stessa regola per le destinazioni sta in electron/markdown-images.cjs (formatDestination): vanno tenute allineate.
 */

const balancedParentheses = (value) => {
  let depth = 0
  for (const char of value) {
    if (char === '(') depth += 1
    else if (char === ')') { depth -= 1; if (depth < 0) return false }
  }
  return depth === 0
}

// Destinazione semplice se non ha nulla di speciale (spazi, `<`, `>`, `\`, parentesi non bilanciate), altrimenti tra `<…>` con l'escape di `\`, `<` e `>`.
export function markdownDestination(value) {
  const text = String(value ?? '').replace(/[\r\n]+/g, '')
  // eslint-disable-next-line no-control-regex
  if (text !== '' && /^[^\s<>\\\u0000-\u001f]+$/.test(text) && balancedParentheses(text)) return text
  return `<${text.replace(/[\\<>]/g, '\\$&')}>`
}

// Testo di un link o `alt` di un'immagine: `[`, `]` e `\` hanno un significato nella sintassi, vanno protetti; niente a capo.
export const markdownLinkText = (value) => String(value ?? '').replace(/\s*[\r\n]+\s*/g, ' ').replace(/[\\[\]]/g, '\\$&')

// Titolo tra virgolette: `"` e `\` interni con l'escape; niente a capo. Stringa vuota se non c'è titolo.
export const markdownTitle = (value) => {
  const text = String(value ?? '').replace(/\s*[\r\n]+\s*/g, ' ').trim()
  return text ? `"${text.replace(/[\\"]/g, '\\$&')}"` : ''
}

// `(destinazione "titolo")` completo, senza le parentesi esterne se non servono: usato da link e immagini.
export const markdownTarget = (destination, title) => {
  const quoted = markdownTitle(title)
  return `${markdownDestination(destination)}${quoted ? ` ${quoted}` : ''}`
}
