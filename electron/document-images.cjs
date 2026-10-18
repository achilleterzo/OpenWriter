const fs = require('node:fs')
const path = require('node:path')
const { fileURLToPath } = require('node:url')
const { t } = require('./i18n.cjs')
const { findImages } = require('./markdown-images.cjs')
const { samePath } = require('./path-compare.cjs')

/**
 * Le immagini di un documento che stanno accanto a lui, nella sottocartella `images/`, lo seguono quando viene spostato in un'altra cartella.
 * Si fa in due tempi: `planImageMove` prima dello spostamento (se qualcosa non va lo spostamento non parte) e `applyImageMove` dopo.
 * Un'immagine che un altro documento richiama ancora (in qualunque cartella del progetto, o tra i documenti collegati) non si toglie dal suo posto:
 * se ne mette una copia. Nel dubbio (un file che non si riesce a leggere, un progetto troppo grande da scorrere) si copia e basta.
 */
const MARKDOWN_FILE = /\.(md|markdown|mdown)$/i
const MAX_SCANNED_FILES = 20000
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'out'])

const exists = (file) => fs.existsSync(file)

function sameContent(left, right) {
  try {
    const a = fs.statSync(left)
    const b = fs.statSync(right)
    return a.size === b.size && fs.readFileSync(left).equals(fs.readFileSync(right))
  } catch { return false }
}

// Percorso di un'immagine richiamata da un documento (relativo, assoluto o file:///); null per indirizzi web, data: e simili.
function resolveLink(link, documentDirectory) {
  let value = String(link || '')
  try { value = decodeURI(value) } catch { /* si usa com'è */ }
  if (!value) return null
  if (/^file:\/\//i.test(value)) { try { return fileURLToPath(value) } catch { return null } }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^[A-Za-z]:[\\/]/.test(value)) return null
  const clean = value.split(/[?#]/)[0]
  if (!clean) return null
  return path.isAbsolute(clean) ? path.resolve(clean) : path.resolve(documentDirectory, clean)
}

// Immagini di un documento Markdown già risolte in percorsi assoluti (le destinazioni le leggono i token del Markdown, non una regex).
function localImages(markdown, documentPath) {
  const directory = path.dirname(documentPath)
  const found = []
  for (const image of findImages(markdown)) {
    const resolved = resolveLink(image.destination ? image.destination.value : image.href, directory)
    if (resolved) found.push(resolved)
  }
  return found
}

// Nomi dei file di `<cartella del documento>/images/` che il documento richiama.
function referencedImages(documentPath) {
  let text
  try { text = fs.readFileSync(documentPath, 'utf8') } catch { return [] }
  const images = path.join(path.dirname(documentPath), 'images')
  const names = new Set()
  for (const resolved of localImages(text, documentPath)) {
    if (samePath(path.dirname(resolved), images) && exists(resolved)) names.add(path.basename(resolved))
  }
  return [...names]
}

// Documenti Markdown sotto `root` (esclusi cartelle nascoste, node_modules…); `complete` è false se il progetto è troppo grande da scorrere.
function markdownFilesUnder(root) {
  const files = []
  const pending = [root]
  let complete = true
  while (pending.length) {
    const directory = pending.pop()
    let entries
    try { entries = fs.readdirSync(directory, { withFileTypes: true }) } catch { complete = false; continue }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !SKIPPED_DIRECTORIES.has(entry.name)) pending.push(path.join(directory, entry.name))
      } else if (MARKDOWN_FILE.test(entry.name)) {
        files.push(path.join(directory, entry.name))
        if (files.length > MAX_SCANNED_FILES) return { files, complete: false }
      }
    }
  }
  return { files, complete }
}

// Un altro documento (del progetto, o collegato) richiama ancora questa immagine? Se non si può escludere, la risposta è sì.
function usedByOthers(documentPath, imagePath, { scanRoot = null, extraDocuments = [] } = {}) {
  const roots = scanRoot ? [scanRoot, path.dirname(documentPath)] : [path.dirname(documentPath)]
  const candidates = new Map()
  let complete = true
  for (const root of roots) {
    const scan = markdownFilesUnder(root)
    complete = complete && scan.complete
    for (const file of scan.files) candidates.set(path.resolve(file), file)
  }
  for (const file of extraDocuments) if (MARKDOWN_FILE.test(String(file))) candidates.set(path.resolve(file), file)
  const name = path.basename(imagePath)
  for (const file of candidates.values()) {
    if (samePath(file, documentPath)) continue
    let text
    try { text = fs.readFileSync(file, 'utf8') } catch { return true }
    // Scarto veloce: se il nome del file non compare nemmeno (in nessuna forma) il documento non può richiamarla.
    const forms = [name, encodeURI(name), name.replace(/ /g, '%20')]
    if (!forms.some((form) => text.includes(form))) continue
    if (localImages(text, file).some((resolved) => samePath(resolved, imagePath))) return true
  }
  return !complete
}

// Prima dello spostamento: quali immagini seguono il documento. Lancia se nella cartella di destinazione c'è già un'immagine con lo stesso
// nome ma diversa: meglio non spostare che sostituirla o far puntare il documento a quella sbagliata.
// `scanRoot` è la cartella del progetto, `extraDocuments` i documenti collegati: lì si cerca chi usa ancora le immagini.
function planImageMove(source, destination, options = {}) {
  if (!MARKDOWN_FILE.test(source) || samePath(path.dirname(source), path.dirname(destination))) return []
  const fromFolder = path.join(path.dirname(source), 'images')
  const toFolder = path.join(path.dirname(destination), 'images')
  return referencedImages(source).map((name) => {
    const from = path.join(fromFolder, name)
    const to = path.join(toFolder, name)
    const present = exists(to)
    if (present && !sameContent(from, to)) throw new Error(t('The document uses the image "{name}", but the destination already has a different image with that name in its images folder', { name }))
    return { from, to, copy: !present, keep: usedByOthers(source, from, options) }
  })
}

// Dopo lo spostamento: si copiano le immagini nella nuova cartella e si tolgono dalla vecchia quelle che nessun altro documento usa.
// Un errore qui non deve far fallire lo spostamento già avvenuto.
function applyImageMove(plan) {
  const removedFrom = new Set()
  for (const { from, to, copy, keep } of plan) {
    try {
      if (copy) {
        fs.mkdirSync(path.dirname(to), { recursive: true })
        fs.copyFileSync(from, to)
      }
      if (!keep) { fs.rmSync(from, { force: true }); removedFrom.add(path.dirname(from)) }
    } catch (error) {
      console.error('Immagine non spostata:', from, error.message)
    }
  }
  // La vecchia cartella images/ rimasta vuota si toglie.
  for (const folder of removedFrom) {
    try { if (!fs.readdirSync(folder).length) fs.rmdirSync(folder) } catch { /* non vuota o già tolta */ }
  }
  return plan.length
}

module.exports = { planImageMove, applyImageMove, usedByOthers, resolveLink }
