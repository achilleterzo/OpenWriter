const fs = require('node:fs')
const path = require('node:path')
const { t } = require('./i18n.cjs')

const MAX_SOURCE_BYTES = 8 * 1024 * 1024
const MAX_SVG_BYTES = 512 * 1024
const MAX_PNG_BYTES = 512 * 1024
// Le immagini animate (GIF, WebP) si tengono com'sono, per non perdere l'animazione: un tetto di peso le tiene leggere da caricare nelle liste.
const MAX_ANIMATED_BYTES = 1024 * 1024
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
// Formati offerti nel selettore di file. Quelli raster li decodifica l'interfaccia (Chromium legge anche GIF, WebP, BMP e ICO,
// che `nativeImage` di Electron non legge) e restituisce un PNG ridimensionato; lo SVG si copia com'è.
const RASTER_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif']
const ICON_EXTENSIONS = [...RASTER_EXTENSIONS, 'svg']

/**
 * Icona di un progetto: `<progetto>/.ow/icon.png` (un'immagine qualunque, già ridimensionata a 128 px dall'interfaccia), `icon.svg` (copiato
 * com'è) oppure `icon.gif` / `icon.webp` (animati, copiati com'è). Se ne tiene una sola. Viaggia con il progetto, come il resto della `.ow`.
 */
const iconFiles = (directory) => Object.fromEntries(['png', 'svg', 'gif', 'webp'].map((kind) => [kind, path.join(directory, '.ow', `icon.${kind}`)]))
const MIME_TYPES = { png: 'image/png', svg: 'image/svg+xml', gif: 'image/gif', webp: 'image/webp' }

// Immagine come data URL (l'interfaccia la usa in un <img>: uno SVG così non esegue script), o null.
function getIcon(directory) {
  const files = iconFiles(path.resolve(String(directory || '')))
  try {
    for (const kind of Object.keys(MIME_TYPES)) {
      if (fs.existsSync(files[kind])) return `data:${MIME_TYPES[kind]};base64,${fs.readFileSync(files[kind]).toString('base64')}`
    }
  } catch { /* un'icona illeggibile equivale a nessuna icona */ }
  return null
}

function removeIcon(directory) {
  const files = iconFiles(path.resolve(String(directory || '')))
  for (const file of Object.values(files)) fs.rmSync(file, { force: true })
}

// Contenuto del file scelto, per l'interfaccia: { extension, data (base64) }.
function readSource(source) {
  const extension = path.extname(source).slice(1).toLowerCase()
  if (!ICON_EXTENSIONS.includes(extension)) throw new Error(t('Unsupported image format'))
  const size = fs.statSync(source).size
  if (size > (extension === 'svg' ? MAX_SVG_BYTES : MAX_SOURCE_BYTES)) throw new Error(t('The image is too large'))
  return { extension, data: fs.readFileSync(source).toString('base64') }
}

// Salva l'icona: `kind` 'svg' (testo SVG in base64), 'png' (PNG già ridimensionato dall'interfaccia) oppure 'gif' / 'webp' (animati, com'erano).
function saveIcon(directory, kind, data) {
  const files = iconFiles(path.resolve(String(directory || '')))
  const buffer = Buffer.from(String(data || ''), 'base64')
  if (kind === 'svg') {
    if (buffer.length > MAX_SVG_BYTES) throw new Error(t('The image is too large'))
    if (!/<svg[\s>]/i.test(buffer.toString('utf8'))) throw new Error(t('This is not a valid SVG image'))
  } else if (kind === 'png') {
    if (buffer.length > MAX_PNG_BYTES) throw new Error(t('The image is too large'))
    if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) throw new Error(t('The image could not be read'))
  } else if (kind === 'gif' || kind === 'webp') {
    if (buffer.length > MAX_ANIMATED_BYTES) throw new Error(t('The animated image is too large (at most 1 MB): choose a smaller one'))
    const head = buffer.subarray(0, 12).toString('latin1')
    const valid = kind === 'gif' ? /^GIF8[79]a/.test(head) : head.startsWith('RIFF') && head.endsWith('WEBP')
    if (!valid) throw new Error(t('The image could not be read'))
  } else {
    throw new Error(t('Unsupported image format'))
  }
  removeIcon(directory)
  const target = files[kind]
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, buffer)
  return getIcon(directory)
}

module.exports = { getIcon, removeIcon, readSource, saveIcon, ICON_EXTENSIONS }
