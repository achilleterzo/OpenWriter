/**
 * Gli estratti dei risultati di ricerca sono frammenti di Markdown (tagliati a metà di un grassetto, di una tabella, di un link) con le parole trovate tra « ».
 * Mostrarli com'è riempie la riga di simboli di formattazione: qui si leggono in modo tollerante e diventano pezzi di testo con il loro stile, da disegnare in una riga.
 *
 *   snippetTokens(text) → [{ text, bold?, italic?, code?, strike?, mark? }]
 *
 * Non è un interprete completo (un frammento non è un documento): togli i simboli di blocco (titoli, citazioni, elenchi, righe di tabella, recinti di codice, linee),
 * lascia il testo di link e immagini, e rende grassetto, corsivo, barrato e codice in linea. Un simbolo rimasto aperto per il taglio (un `**` senza chiusura) si toglie.
 * Le parole trovate (« ») si portano fino in fondo, anche attraverso gli stili.
 */

const ESCAPABLE = '\\\\`*_{}\\[\\]()#+\\-.!|~>'

// I simboli in linea, in ordine: vince quello che comincia prima (a parità, il primo della lista).
const INLINE = [
  { re: /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/, run: (m) => [{ text: m[2].trim(), code: true }] },
  { re: /!\[([^\]]*)\]\([^)]*\)/, run: (m, style) => inline(m[1], style) },
  { re: /\[([^\]]*)\]\([^)]*\)/, run: (m, style) => inline(m[1], style) },
  { re: /\[([^\]]+)\]\[[^\]]*\]/, run: (m, style) => inline(m[1], style) },
  { re: /\[\^[^\]]+\]/, run: () => [] },
  { re: /<(https?:\/\/[^>\s]+)>/, run: (m, style) => [{ text: m[1], ...style }] },
  { re: /<\/?[a-zA-Z][^>]*>/, run: () => [] },
  { re: /\*\*([^*]+?)\*\*|__([^_]+?)__/, run: (m, style) => inline(m[1] ?? m[2], { ...style, bold: true }) },
  { re: /~~([^~]+?)~~/, run: (m, style) => inline(m[1], { ...style, strike: true }) },
  { re: /\*([^*\s][^*]*?)\*|(?<![\w])_([^_\s][^_]*?)_(?![\w])/, run: (m, style) => inline(m[1] ?? m[2], { ...style, italic: true }) },
  { re: new RegExp(`\\\\([${ESCAPABLE}])`), run: (m, style) => [{ text: m[1], ...style }] },
]

function inline(source, style = {}) {
  const tokens = []
  let rest = source
  while (rest) {
    let best = null
    for (const pattern of INLINE) {
      const match = pattern.re.exec(rest)
      if (match && (!best || match.index < best.match.index)) best = { match, pattern }
    }
    if (!best) { tokens.push({ text: rest, ...style }); break }
    if (best.match.index > 0) tokens.push({ text: rest.slice(0, best.match.index), ...style })
    tokens.push(...best.pattern.run(best.match, style))
    rest = rest.slice(best.match.index + best.match[0].length)
  }
  return tokens
}

// Una riga: toglie i simboli di blocco. → { text, style } oppure null se la riga è solo struttura (linea, recinto di codice, separatore di tabella).
function block(line) {
  if (/^\s*(```|~~~)/.test(line)) return null
  if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) return null
  if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line) && line.includes('-') && /[|]/.test(line)) return null
  let text = line
  let style = {}
  const heading = /^\s{0,3}#{1,6}\s+/.exec(text)
  if (heading) { text = text.slice(heading[0].length); style = { bold: true } }
  text = text.replace(/^\s*(>\s?)+/, '')
  const task = /^\s*[-*+]\s+\[([ xX])\]\s+/.exec(text)
  if (task) text = `${task[1] === ' ' ? '☐' : '☑'} ${text.slice(task[0].length)}`
  else {
    const item = /^\s*([-*+]|\d+[.)])\s+/.exec(text)
    if (item) text = `${/^\d/.test(item[1]) ? item[1] : '•'} ${text.slice(item[0].length)}`
  }
  // Una riga di tabella: le celle si separano con un punto mediano.
  if ((text.match(/\|/g) || []).length >= 2) text = text.split('|').map((cell) => cell.trim()).filter(Boolean).join(' · ')
  // Un `#` di titolo rimasto in mezzo al testo (l'estratto del significato è su una riga sola).
  text = text.replace(/(^|\s)#{1,6}\s+(?=\S)/g, '$1')
  return { text, style }
}

export function snippetTokens(text) {
  const pieces = []
  for (const line of String(text ?? '').replace(/\r/g, '').split('\n')) {
    const parsed = block(line)
    if (!parsed || !parsed.text.trim()) continue
    if (pieces.length) pieces.push({ text: ' ' })
    pieces.push(...inline(parsed.text, parsed.style))
  }
  // Simboli rimasti aperti per il taglio dell'estratto: `**` e `~~` non hanno altro significato.
  const cleaned = pieces.map((piece) => (piece.code ? piece : { ...piece, text: piece.text.replace(/\*\*|~~/g, '') })).filter((piece) => piece.text)
  // Le parole trovate: « » commutano l'evidenziazione, anche attraverso gli stili.
  const result = []
  let marking = false
  for (const piece of cleaned) {
    for (const part of piece.text.split(/([«»])/)) {
      if (part === '«') { marking = true; continue }
      if (part === '»') { marking = false; continue }
      if (!part) continue
      const { text: _text, ...style } = piece
      result.push({ ...style, text: part, ...(marking ? { mark: true } : {}) })
    }
  }
  // Pezzi vicini con lo stesso stile si uniscono.
  const merged = []
  for (const piece of result) {
    const last = merged[merged.length - 1]
    const same = last && ['bold', 'italic', 'code', 'strike', 'mark'].every((key) => Boolean(last[key]) === Boolean(piece[key]))
    if (same) last.text += piece.text
    else merged.push({ ...piece })
  }
  return merged
}
