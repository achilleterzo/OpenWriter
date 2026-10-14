const fs = require('node:fs')
const path = require('node:path')
const { t } = require('./i18n.cjs')

/**
 * Le immagini di un documento che stanno accanto a lui, nella sottocartella `images/`, lo seguono quando viene spostato in un'altra cartella.
 * Si fa in due tempi: `planImageMove` prima dello spostamento (se qualcosa non va lo spostamento non parte) e `applyImageMove` dopo.
 * Le immagini condivise con altri documenti della cartella restano dov'erano e se ne mette una copia; le altre si spostano.
 */
const MARKDOWN_FILE = /\.(md|markdown|mdown)$/i
// ![testo](percorso "titolo") oppure ![testo](<percorso con spazi>)
const IMAGE_LINK = /!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^)\s]+))(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g

const sameFolder = (left, right) => path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()
const exists = (file) => fs.existsSync(file)

function sameContent(left, right) {
  try {
    const a = fs.statSync(left)
    const b = fs.statSync(right)
    return a.size === b.size && fs.readFileSync(left).equals(fs.readFileSync(right))
  } catch { return false }
}

// Nomi dei file di `<cartella del documento>/images/` che il documento richiama con un collegamento relativo.
function referencedImages(documentPath) {
  let text
  try { text = fs.readFileSync(documentPath, 'utf8') } catch { return [] }
  const directory = path.dirname(documentPath)
  const images = path.join(directory, 'images')
  const names = new Set()
  for (const match of text.matchAll(IMAGE_LINK)) {
    let link = match[1] || match[2] || ''
    try { link = decodeURI(link) } catch { /* si usa com'è */ }
    // Indirizzi web, file:, data: e percorsi assoluti non sono "accanto al documento".
    if (!link || /^[a-z][a-z0-9+.-]*:/i.test(link) || link.startsWith('/') || link.startsWith('\\')) continue
    const resolved = path.resolve(directory, link.split(/[?#]/)[0])
    if (sameFolder(path.dirname(resolved), images) && exists(resolved)) names.add(path.basename(resolved))
  }
  return [...names]
}

// Altri documenti Markdown della stessa cartella che richiamano l'immagine.
function usedByOthers(documentPath, name) {
  const directory = path.dirname(documentPath)
  let siblings = []
  try { siblings = fs.readdirSync(directory).filter((file) => MARKDOWN_FILE.test(file) && !sameFolder(path.join(directory, file), documentPath)) } catch { return false }
  const forms = [`images/${name}`, `images/${encodeURI(name)}`, `images\\${name}`]
  return siblings.some((file) => {
    try {
      const text = fs.readFileSync(path.join(directory, file), 'utf8')
      return forms.some((form) => text.includes(form))
    } catch { return false }
  })
}

// Prima dello spostamento: quali immagini seguono il documento. Lancia se nella cartella di destinazione c'è già un'immagine con lo stesso
// nome ma diversa: meglio non spostare che sostituirla o far puntare il documento a quella sbagliata.
function planImageMove(source, destination) {
  if (!MARKDOWN_FILE.test(source) || sameFolder(path.dirname(source), path.dirname(destination))) return []
  const fromFolder = path.join(path.dirname(source), 'images')
  const toFolder = path.join(path.dirname(destination), 'images')
  return referencedImages(source).map((name) => {
    const from = path.join(fromFolder, name)
    const to = path.join(toFolder, name)
    const present = exists(to)
    if (present && !sameContent(from, to)) throw new Error(t('The document uses the image "{name}", but the destination already has a different image with that name in its images folder', { name }))
    return { from, to, copy: !present, keep: usedByOthers(source, name) }
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

module.exports = { planImageMove, applyImageMove }
