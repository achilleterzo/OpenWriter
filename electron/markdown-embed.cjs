const fs = require('node:fs')
const path = require('node:path')
const { fileURLToPath } = require('node:url')

/**
 * Esportazione Markdown "autosufficiente": le immagini del documento (file accanto al documento, nel progetto o altrove su disco) si incorporano
 * nel testo come data: URI, così il file .md si passa da solo, senza la cartella images/ e senza uno zip.
 * Restano com'erano le immagini già incorporate (data:) e quelle remote (http/https); i file che mancano o sono troppo grandi si segnalano.
 */
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp', '.svg': 'image/svg+xml' }
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_TOTAL_BYTES = 60 * 1024 * 1024

// ![testo](percorso "titolo") oppure ![testo](<percorso con spazi> 'titolo'): anche dentro un link ([![…](…)](…)).
const IMAGE = /!\[([^\]]*)\]\(\s*(?:<([^>]+)>|([^)\s]+))((?:\s+(?:"[^"]*"|'[^']*'))?)\s*\)/g

function resolveSource(source, documentPath) {
  let value = source
  try { value = decodeURI(value) } catch { /* si usa com'è */ }
  if (/^file:\/\//i.test(value)) {
    try { return fileURLToPath(source) } catch { return null }
  }
  value = value.split(/[?#]/)[0]
  if (path.isAbsolute(value)) return value
  if (!documentPath) return null
  return path.resolve(path.dirname(documentPath), value)
}

function embedImages(markdown, documentPath) {
  const cache = new Map()
  const report = { embedded: 0, missing: [], tooLarge: [], remote: 0 }
  let total = 0

  const toDataUri = (source) => {
    if (cache.has(source)) return cache.get(source)
    let result = null
    const absolute = resolveSource(source, documentPath)
    const mime = absolute ? MIME[path.extname(absolute).toLowerCase()] : null
    try {
      const stats = absolute && mime ? fs.statSync(absolute) : null
      if (!stats || !stats.isFile()) report.missing.push(source)
      else if (stats.size > MAX_IMAGE_BYTES || total + stats.size > MAX_TOTAL_BYTES) report.tooLarge.push(source)
      else {
        total += stats.size
        result = `data:${mime};base64,${fs.readFileSync(absolute).toString('base64')}`
        report.embedded += 1
      }
    } catch { report.missing.push(source) }
    cache.set(source, result)
    return result
  }

  const output = String(markdown).replace(IMAGE, (whole, alt, bracketed, plain, title) => {
    const source = bracketed || plain
    if (/^data:/i.test(source)) return whole
    if (/^https?:\/\//i.test(source)) { report.remote += 1; return whole }
    const uri = toDataUri(source)
    return uri ? `![${alt}](${uri}${title})` : whole
  })
  return { markdown: output, ...report }
}

module.exports = { embedImages }
