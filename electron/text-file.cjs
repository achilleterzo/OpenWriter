const path = require('node:path')
const fs = require('node:fs')
const { writeFileAtomic } = require('./atomic-write.cjs')

/**
 * File di testo qualsiasi (codice, configurazioni, registri, dati…) per il lettore testuale: si leggono e si salvano senza interpretarli, e senza cambiarli oltre
 * a ciò che l'utente modifica. Dell'originale si ricordano e si rimettono al salvataggio la codifica a capo (LF o CRLF) e la firma UTF-8 (BOM): il campo di testo
 * lavora sempre con LF, e senza questo ogni salvataggio convertirebbe un file di Windows.
 *
 *   decodeText(buffer)                → { text, eol: 'lf' | 'crlf', bom }, oppure un errore con `code`: 'NOT_TEXT' (binario o non UTF-8)
 *   encodeText(text, { eol, bom })    → Buffer
 *   readTextFile(file, { limit })     → { filePath, content, eol, bom, size }; errore con `code` 'TEXT_TOO_LARGE' oltre `limit` byte
 *   writeTextFile(file, text, opts)   scrittura atomica
 *   isBinaryName(name)                → true per le estensioni note di file non testuali (l'albero non li offre come apribili)
 */
const TEXT_LIMIT = 1024 * 1024

const BINARY_EXTENSIONS = new Set([
  // archivi e pacchetti
  '.zip', '.7z', '.rar', '.tar', '.gz', '.tgz', '.bz2', '.xz', '.zst', '.iso', '.dmg', '.pkg', '.deb', '.rpm', '.msi', '.cab', '.jar', '.war', '.apk', '.ipa', '.whl', '.nupkg',
  // eseguibili e librerie
  '.exe', '.dll', '.so', '.dylib', '.bin', '.o', '.obj', '.a', '.lib', '.class', '.pyc', '.pyo', '.wasm', '.node', '.sys', '.drv',
  // audio, video
  '.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.wma', '.mid', '.midi', '.mp4', '.mkv', '.avi', '.mov', '.wmv', '.webm', '.flv', '.m4v',
  // immagini e grafica (le immagini note si aprono nel visore: queste no)
  '.psd', '.ai', '.sketch', '.fig', '.xcf', '.tif', '.tiff', '.raw', '.cr2', '.nef', '.heic', '.heif',
  // documenti e archivi di dati binari
  '.doc', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp', '.epub', '.mobi', '.db', '.sqlite', '.sqlite3', '.mdb', '.accdb', '.dat', '.pak',
  // caratteri
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
])

const isBinaryName = (name) => BINARY_EXTENSIONS.has(path.extname(String(name || '')).toLowerCase())

function notText() {
  const error = new Error('This file does not look like text (it is binary or not UTF-8)')
  error.code = 'NOT_TEXT'
  return error
}

function decodeText(buffer) {
  let bytes = buffer
  const bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  if (bom) bytes = bytes.subarray(3)
  // Un byte nullo nei primi blocchi: è un file binario.
  if (bytes.subarray(0, 8000).includes(0)) throw notText()
  let text
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { throw notText() }
  const crlf = (text.match(/\r\n/g) || []).length
  const lf = (text.match(/(?<!\r)\n/g) || []).length
  const eol = crlf > lf ? 'crlf' : 'lf'
  // Con più di un tipo di a capo si normalizza a quello prevalente: il campo di testo ne ha uno solo.
  return { text: text.replace(/\r\n/g, '\n'), eol, bom }
}

function encodeText(text, { eol = 'lf', bom = false } = {}) {
  const body = eol === 'crlf' ? String(text).replace(/\n/g, '\r\n') : String(text)
  const encoded = Buffer.from(body, 'utf8')
  return bom ? Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), encoded]) : encoded
}

async function readTextFile(filePath, { limit = TEXT_LIMIT } = {}) {
  const stats = await fs.promises.stat(filePath)
  if (!stats.isFile()) throw new Error('Not a file')
  if (stats.size > limit) {
    const error = new Error(`This file is too large to open here (${(stats.size / 1048576).toFixed(1)} MB, the limit is ${(limit / 1048576).toFixed(0)} MB)`)
    error.code = 'TEXT_TOO_LARGE'
    throw error
  }
  const { text, eol, bom } = decodeText(await fs.promises.readFile(filePath))
  return { filePath, content: text, eol, bom, size: stats.size }
}

function writeTextFile(filePath, text, options) {
  // La sostituzione atomica crea un file nuovo: i permessi del vecchio (un script eseguibile) si ripassano al nuovo, altrimenti si perderebbero.
  try { filePath = fs.realpathSync(filePath) } catch (error) { if (error.code !== 'ENOENT') throw error }
  let mode
  try { mode = fs.statSync(filePath).mode & 0o777 } catch { /* file nuovo */ }
  writeFileAtomic(filePath, encodeText(text, options), mode === undefined ? undefined : { mode })
  if (mode !== undefined) fs.chmodSync(filePath, mode)
}

module.exports = { TEXT_LIMIT, BINARY_EXTENSIONS, isBinaryName, decodeText, encodeText, readTextFile, writeTextFile }
