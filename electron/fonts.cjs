const fs = require('node:fs/promises')
const path = require('node:path')
const { writeFileAtomic } = require('./atomic-write.cjs')

const CATALOG_URL = 'https://fonts.google.com/metadata/fonts'
const CSS_URL = 'https://fonts.googleapis.com/css2'
// Con un browser moderno Google risponde con file woff2 divisi per sottoinsiemi di caratteri.
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const CATEGORIES = { 'Sans Serif': 'sans', Serif: 'serif', Monospace: 'mono' }

const slugOf = (family) => family.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Caratteri del catalogo Google Fonts, scaricati su richiesta e tenuti nei dati dell'app: dopo l'installazione funzionano anche senza rete.
function createFontsStore({ directory }) {
  let catalogCache = null

  async function fetchText(url) {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.text()
  }

  async function catalog() {
    if (catalogCache) return catalogCache
    const text = await fetchText(CATALOG_URL)
    const list = JSON.parse(text.slice(text.indexOf('{'))).familyMetadataList || []
    catalogCache = list
      .filter((entry) => Array.isArray(entry.subsets) && entry.subsets.includes('latin'))
      .sort((left, right) => (left.popularity ?? 1e9) - (right.popularity ?? 1e9))
      .map((entry) => ({ family: entry.family, category: CATEGORIES[entry.category] || 'other', variants: Object.keys(entry.fonts || {}) }))
    return catalogCache
  }

  // Richiesta css2: normale e grassetto, con i corsivi se il carattere li ha.
  function specFor(variants) {
    const regular = variants.filter((variant) => /^\d+$/.test(variant)).map(Number).sort((left, right) => left - right)
    const italic = new Set(variants.filter((variant) => /^\d+i$/.test(variant)).map((variant) => Number(variant.slice(0, -1))))
    const pick = (weights) => [400, 700].filter((weight) => weights.includes(weight))
    const upright = pick(regular).length ? pick(regular) : regular.slice(0, 1)
    if (!upright.length) return null
    const slanted = pick([...italic])
    if (!slanted.length) return `:wght@${upright.join(';')}`
    return `:ital,wght@${[...upright.map((weight) => `0,${weight}`), ...slanted.map((weight) => `1,${weight}`)].join(';')}`
  }

  async function inline(css) {
    // Solo i sottoinsiemi latin e latin-ext: bastano per le lingue dell'interfaccia e tengono il carattere leggero.
    const blocks = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)].filter((match) => match[1] === 'latin' || match[1] === 'latin-ext')
    if (!blocks.length) throw new Error('No latin subset available')
    const out = []
    for (const [, , block] of blocks) {
      const url = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/.exec(block)?.[1]
      if (!url) continue
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = Buffer.from(await response.arrayBuffer()).toString('base64')
      out.push(block.replace(url, `data:font/woff2;base64,${data}`))
    }
    return out.join('\n')
  }

  async function install(family) {
    const entry = (await catalog()).find((item) => item.family === family)
    if (!entry) throw new Error('Font not found in the catalog')
    const name = encodeURIComponent(entry.family).replace(/%20/g, '+')
    const spec = specFor(entry.variants)
    let css
    try { css = await fetchText(`${CSS_URL}?family=${name}${spec || ''}&display=swap`) } catch (error) {
      if (!spec) throw error
      css = await fetchText(`${CSS_URL}?family=${name}&display=swap`)
    }
    const record = { family: entry.family, category: entry.category, css: await inline(css) }
    await fs.mkdir(directory, { recursive: true })
    await writeFileAtomic(path.join(directory, `${slugOf(entry.family)}.json`), JSON.stringify(record))
    return record
  }

  async function list() {
    let names
    try { names = await fs.readdir(directory) } catch { return [] }
    const fonts = []
    for (const name of names.filter((item) => item.endsWith('.json'))) {
      try {
        const record = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'))
        if (typeof record.family === 'string' && typeof record.css === 'string') fonts.push(record)
      } catch { /* file rovinato: ignorato */ }
    }
    return fonts.sort((left, right) => left.family.localeCompare(right.family))
  }

  async function remove(family) {
    await fs.rm(path.join(directory, `${slugOf(String(family))}.json`), { force: true })
  }

  return { catalog, install, list, remove }
}

module.exports = { createFontsStore }
