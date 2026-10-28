const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

/**
 * L'inverso di markdown-embed.cjs: le immagini incorporate nel testo (data:image/…;base64,…) diventano file in una cartella accanto al documento
 * e il Markdown le collega con un percorso relativo. Lavora sul testo riga per riga (anche decine di MB) senza costruire un albero del documento,
 * e capisce sia le definizioni di riferimento (`[chiave]: data:…`, quelle di un documento consolidato) sia le immagini in linea e i tag <img>.
 * Non tocca gli esempi dentro i blocchi di codice.
 */
const TYPES = 'png|jpe?g|gif|webp|bmp'
const DEFINITION = new RegExp(`^(\\s{0,3}\\[([^\\]]+)\\]:\\s*)<?data:image/(${TYPES});base64,([A-Za-z0-9+/=]+)>?([\\s\\S]*)$`, 'i')
const INLINE = new RegExp(`(\\]\\(\\s*)<?data:image/(${TYPES});base64,([A-Za-z0-9+/=]+)>?`, 'gi')
const HTML = new RegExp(`(src=["'])data:image/(${TYPES});base64,([A-Za-z0-9+/=]+)(["'])`, 'gi')
const FENCE = /^\s{0,3}(`{3,}|~{3,})/

const safe = (value) => String(value).replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '')

/** `directory`: dove scrivere le immagini; `link`: prefisso del percorso relativo nel Markdown (default "images"). */
function extractImages(markdown, { directory, link = 'images', stem = 'image' }) {
  const names = new Map() // contenuto → nome
  let count = 0
  let bytes = 0

  const store = (data, type, label) => {
    if (names.has(data)) return names.get(data)
    const buffer = Buffer.from(data, 'base64')
    const hash = crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 8)
    const extension = /^jpe?g$/i.test(type) ? 'jpg' : type.toLowerCase()
    let base = label ? safe(label) : ''
    if (!base) base = `${safe(stem) || 'image'}-${hash}`
    fs.mkdirSync(directory, { recursive: true })
    // Un file già presente si riusa solo se ha esattamente gli stessi byte; altrimenti si cerca un nome libero, senza mai sovrascrivere altre immagini.
    let name = ''
    let write = true
    for (let attempt = 0; ; attempt += 1) {
      const suffix = attempt === 0 ? '' : attempt === 1 ? `-${hash}` : `-${hash}-${attempt}`
      const candidate = `${base}${suffix}.${extension}`
      const target = path.join(directory, candidate)
      let existing = null
      try { existing = fs.readFileSync(target) } catch { /* libero */ }
      if (!existing) { name = candidate; break }
      if (existing.equals(buffer)) { name = candidate; write = false; break }
    }
    if (write) fs.writeFileSync(path.join(directory, name), buffer, { flag: 'wx' })
    count += 1
    bytes += buffer.length
    names.set(data, name)
    return name
  }

  let fence = null
  const lines = String(markdown).split('\n').map((line) => {
    const open = FENCE.exec(line)
    if (open) {
      if (!fence) fence = open[1][0]
      else if (fence === open[1][0]) fence = null
      return line
    }
    if (fence || !line.includes('data:image/')) return line
    const definition = DEFINITION.exec(line)
    if (definition) return `${definition[1]}${link}/${store(definition[4], definition[3], definition[2])}${definition[5]}`
    return line
      .replace(INLINE, (_all, head, type, data) => `${head}${link}/${store(data, type)}`)
      .replace(HTML, (_all, head, type, data, tail) => `${head}${link}/${store(data, type)}${tail}`)
  })
  return { markdown: lines.join('\n'), count, bytes }
}

module.exports = { extractImages }
