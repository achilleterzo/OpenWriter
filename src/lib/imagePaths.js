// Percorsi delle immagini nei documenti Markdown.
// Nel file si scrive un percorso relativo al documento (se l'immagine sta nel progetto o accanto al documento),
// altrimenti un indirizzo file:/// assoluto. Per mostrarle l'editor le trasforma in indirizzi ow-file:// serviti dal processo principale.

const normalize = (value) => String(value || '').replace(/\\/g, '/')
const isWindowsPath = (value) => /^[A-Za-z]:\//.test(value)
const comparable = (value) => (isWindowsPath(value) ? value.toLowerCase() : value)

export const dirname = (value) => normalize(value).replace(/\/[^/]*$/, '')

export function isInside(child, parent) {
  if (!parent) return false
  const base = comparable(normalize(parent)).replace(/\/$/, '')
  return comparable(normalize(child)).startsWith(`${base}/`)
}

function relativePath(fromDirectory, target) {
  const from = normalize(fromDirectory).split('/')
  const to = normalize(target).split('/')
  let shared = 0
  while (shared < from.length && shared < to.length && comparable(from[shared]) === comparable(to[shared])) shared += 1
  return [...from.slice(shared).map(() => '..'), ...to.slice(shared)].join('/')
}

function joinPath(directory, relative) {
  const parts = normalize(directory).split('/')
  for (const segment of relative.split('/')) {
    if (segment === '..') parts.pop()
    else if (segment && segment !== '.') parts.push(segment)
  }
  return parts.join('/')
}

const safeDecode = (value) => { try { return decodeURI(value) } catch { return value } }

/** Testo da scrivere nel Markdown per l'immagine `imagePath` (assoluto) inserita nel documento `documentPath`. */
export function sourceForImage(imagePath, documentPath, project) {
  const image = normalize(imagePath)
  const directory = dirname(documentPath)
  if (isInside(image, project) || isInside(image, directory)) return encodeURI(relativePath(directory, image))
  return encodeURI(`file://${image.startsWith('/') ? '' : '/'}${image}`)
}

/** Indirizzo da caricare nell'editor per il `src` scritto nel Markdown; stringa vuota se non si può risolvere. */
export function displaySource(src, documentPath) {
  const value = String(src || '')
  if (/^(https?:|data:image\/|ow-file:)/i.test(value)) return value
  let absolute
  if (/^file:\/\//i.test(value)) {
    absolute = safeDecode(value.replace(/^file:\/\//i, ''))
    if (/^\/[A-Za-z]:/.test(absolute)) absolute = absolute.slice(1)
  } else {
    if (!documentPath) return ''
    absolute = joinPath(dirname(documentPath), safeDecode(value))
  }
  return `ow-file://local/${encodeURIComponent(absolute)}`
}

/**
 * Destinazione di un collegamento del documento:
 *   { kind: 'external', url }   indirizzo http(s)
 *   { kind: 'file', path }      file locale (relativo al documento, assoluto o file:///), senza #ancora né ?query
 *   { kind: 'anchor' }          riferimento interno (#titolo)
 *   { kind: 'unresolved' }      percorso relativo in un documento mai salvato, o schema non gestito
 */
export function resolveDocumentLink(href, documentPath) {
  const value = String(href || '').trim()
  if (!value || value.startsWith('#')) return { kind: 'anchor' }
  if (/^https?:\/\//i.test(value)) return { kind: 'external', url: value }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^file:\/\//i.test(value) && !/^[A-Za-z]:[\\/]/.test(value)) return { kind: 'unresolved' }
  const clean = value.replace(/[?#].*$/, '')
  if (/^file:\/\//i.test(clean)) {
    let absolute = safeDecode(clean.replace(/^file:\/\//i, ''))
    if (/^\/[A-Za-z]:/.test(absolute)) absolute = absolute.slice(1)
    return { kind: 'file', path: absolute }
  }
  if (/^([A-Za-z]:)?[\\/]/.test(clean)) return { kind: 'file', path: normalize(safeDecode(clean)) }
  if (!documentPath) return { kind: 'unresolved' }
  return { kind: 'file', path: joinPath(dirname(documentPath), safeDecode(clean)) }
}
