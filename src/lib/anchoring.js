// Ancoraggio delle note al testo: una nota ricorda la citazione (e un po' di contesto) invece di una posizione,
// così regge alle modifiche del documento e il Markdown resta pulito.

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// Testo piano del documento (blocchi separati da "\n") con la mappa verso le posizioni ProseMirror.
export function buildTextIndex(doc) {
  let text = ''
  const segments = []
  doc.descendants((node, pos) => {
    if (node.isText) {
      segments.push({ start: text.length, pos, length: node.text.length })
      text += node.text
    } else if (node.isBlock && text && !text.endsWith('\n')) {
      text += '\n'
    }
    return true
  })
  return { text, segments }
}

function startToPos({ segments }, offset) {
  const segment = segments.find((item) => offset >= item.start && offset < item.start + item.length)
    || segments.find((item) => item.start >= offset)
  return segment ? segment.pos + Math.max(0, offset - segment.start) : null
}

function endToPos({ segments }, offset) {
  const segment = segments.find((item) => offset > item.start && offset <= item.start + item.length)
    || [...segments].reverse().find((item) => item.start + item.length <= offset)
  return segment ? segment.pos + Math.min(segment.length, offset - segment.start) : null
}

// Tutte le occorrenze della citazione: prima esatte, poi tollerando differenze di spazi e a capo.
export function findAll(text, quote) {
  const needle = String(quote ?? '')
  if (!needle.trim()) return []
  const hits = []
  for (let index = text.indexOf(needle); index !== -1; index = text.indexOf(needle, index + needle.length)) hits.push({ index, length: needle.length })
  if (hits.length) return hits
  const pattern = needle.trim().split(/\s+/).map(escapeRegExp).join('\\s+')
  for (const match of text.matchAll(new RegExp(pattern, 'g'))) hits.push({ index: match.index, length: match[0].length })
  return hits
}

export function toRange(index, hit) {
  const from = startToPos(index, hit.index)
  const to = endToPos(index, hit.index + hit.length)
  return from === null || to === null || to < from ? null : { from, to }
}

// Contesto da salvare con la nota per ritrovare la giusta occorrenza.
export function anchorContext(index, hit) {
  return {
    prefix: index.text.slice(Math.max(0, hit.index - 40), hit.index),
    suffix: index.text.slice(hit.index + hit.length, hit.index + hit.length + 40),
  }
}

// Posizione della nota nel documento: { from, to, count } oppure null se il testo non c'è più.
export function locateQuote(doc, note, index = buildTextIndex(doc)) {
  const hits = findAll(index.text, note.quote)
  if (!hits.length) return null
  let best = hits[0]
  if (hits.length > 1) {
    const score = (hit) => (
      (note.prefix && index.text.slice(Math.max(0, hit.index - note.prefix.length), hit.index) === note.prefix ? 2 : 0)
      + (note.suffix && index.text.slice(hit.index + hit.length, hit.index + hit.length + note.suffix.length) === note.suffix ? 2 : 0)
    )
    best = [...hits].sort((left, right) => score(right) - score(left))[0]
  }
  const range = toRange(index, best)
  return range ? { ...range, count: hits.length } : null
}
