import { buildTextIndex, locateQuote } from './anchoring.js'
import { CASE_INSENSITIVE } from './pathCompare.js'

/**
 * Link ai segnalibri: `file.md#nome` (o `#nome` nello stesso documento). Il frammento indica un segnalibro del documento;
 * se non c'è, un titolo con quel nome (come su GitHub: minuscolo, parole unite da trattini).
 */

// Nome di un titolo come lo ricava GitHub per i link: minuscolo, senza punteggiatura, spazi → trattini.
export function headingSlug(text) {
  return String(text || '').normalize('NFC').toLowerCase().trim().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s/g, '-')
}

const foldName = (value) => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

// Dove porta il frammento in un editor: { from, to, kind: 'bookmark' | 'heading' } oppure null.
export function findFragmentTarget(editor, bookmarks, fragment) {
  const wanted = foldName(fragment)
  if (!wanted || !editor || editor.isDestroyed) return null
  const { doc } = editor.state
  const bookmark = (bookmarks || []).find((item) => foldName(item.name) === wanted)
  if (bookmark) {
    const location = locateQuote(doc, bookmark, buildTextIndex(doc))
    if (location) return { from: location.from, to: location.to, kind: 'bookmark' }
  }
  let heading = null
  doc.descendants((node, pos) => {
    if (heading) return false
    if (node.type.name === 'heading' && foldName(headingSlug(node.textContent)) === wanted) heading = { from: pos + 1, to: pos + 1 + node.content.size, kind: 'heading' }
    return !heading
  })
  return heading
}

const splitPath = (value) => String(value).replace(/\\/g, '/').split('/').filter(Boolean)
const isDrive = (segment) => /^[A-Za-z]:$/.test(segment || '')
// Le maiuscole contano solo dove il file system le distingue (vedi pathCompare.js).
const sameSegment = (left, right) => (CASE_INSENSITIVE ? String(left).toLowerCase() === String(right).toLowerCase() : left === right)

// Indirizzo assoluto equivalente quando non esiste un percorso relativo: file:///E:/cartella/file.md (con gli spazi codificati).
const fileLink = (file) => {
  const normalized = String(file).replace(/\\/g, '/')
  return `file://${normalized.startsWith('/') ? '' : '/'}${encodeURI(normalized)}`
}

// Percorso relativo per un link da un documento a un altro: ("D:/p/a/uno.md", "D:/p/b/due.md") → "../b/due.md".
// Tra unità diverse di Windows ("D:" e "E:") un percorso relativo non esiste: il link diventa un indirizzo assoluto (file:///E:/…).
export function relativeLink(fromFile, toFile) {
  const from = splitPath(fromFile).slice(0, -1)
  const to = splitPath(toFile)
  if ((isDrive(from[0]) || isDrive(to[0])) && !sameSegment(from[0] ?? '', to[0] ?? '')) return fileLink(toFile)
  let shared = 0
  while (shared < from.length && shared < to.length - 1 && sameSegment(from[shared], to[shared])) shared += 1
  const up = Array(from.length - shared).fill('..')
  return [...up, ...to.slice(shared)].join('/') || to.at(-1)
}
