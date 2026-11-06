const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { t } = require('./i18n.cjs')
const { writeFileAtomic } = require('./atomic-write.cjs')

const MAX_ENTRIES = 300
const MAX_MARKDOWN_CHARS = 1_500_000
const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|mc_cid|mc_eid|igshid|ref_src)$/i
const SOURCES = ['user', 'assistant', 'agent']

/**
 * Riferimenti web del progetto: pagine web che l'utente (o l'assistente, o un agente esterno) aggiunge al contesto, con una copia in Markdown, così restano consultabili
 * anche senza rete e l'assistente può leggerle e cercarvi. Stanno dentro `.ow`:
 *   `<progetto>/.ow/web.json`        [ { id, url, title, siteName, savedAt, updatedAt, checkedAt, source, hash, file } ]
 *   `<progetto>/.ow/web/<file>.md`   la copia: un'intestazione (vedi sotto) e il testo dell'articolo
 * La cartella `.ow/web` è, per ricerca e lettura, una cartella di riferimento automatica `@web` (vedi shared-knowledge.cjs): sola lettura per l'assistente.
 *
 * Intestazione della copia (YAML tra due righe `---`, non indicizzata): chi legge il file sa da dove viene e quanto è vecchio, e può decidere se rinfrescarlo.
 *   url, title, site, saved (prima volta), updated (ultima volta che il contenuto è cambiato), checked (ultima verifica sulla pagina viva), saved_by (user | assistant | agent), content_hash.
 */
// Un indirizzo ridotto a ciò che identifica la pagina: senza #ancora, senza parametri di tracciamento (utm_…), con l'host in minuscolo e senza "/" finale.
function normalizeUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    if (!/^https?:$/.test(url.protocol)) return ''
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key)
    url.searchParams.sort()
    const pathname = url.pathname.replace(/\/+$/, '') || ''
    return `${url.protocol}//${url.host.toLowerCase()}${pathname}${url.search}`
  } catch { return '' }
}

// L'indirizzo da conservare: come l'ha visitato l'utente, ma senza #ancora e senza parametri di tracciamento (non servono per riaprire la pagina).
function cleanUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key)
    return url.href
  } catch { return String(value || '').trim() }
}

// Nome di file dal titolo: ascii minuscolo, al più 50 caratteri.
const slugify = (value) => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '')

// Impronta del testo, senza spazi in più: pagine uguali a meno di a capo e spazi non risultano cambiate.
const hashOf = (markdown) => crypto.createHash('sha256').update(String(markdown).replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 16)

const yamlValue = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim()
function headerOf(entry) {
  return ['---', `url: ${yamlValue(entry.url)}`, `title: ${yamlValue(entry.title)}`, ...(entry.siteName ? [`site: ${yamlValue(entry.siteName)}`] : []), `saved: ${entry.savedAt}`, `updated: ${entry.updatedAt}`, `checked: ${entry.checkedAt}`, `saved_by: ${entry.source}`, `content_hash: ${entry.hash}`, '---', ''].join('\n')
}

// Differenza grossolana tra due testi: righe che compaiono solo nel nuovo e righe che sono sparite (basta a dire "poco" o "molto" cambiato).
function lineDifference(before, after) {
  const lines = (text) => String(text).split('\n').map((line) => line.trim()).filter(Boolean)
  const old = new Set(lines(before))
  const next = new Set(lines(after))
  return { added: [...next].filter((line) => !old.has(line)).length, removed: [...old].filter((line) => !next.has(line)).length }
}

function createWebReferencesStore({ getProjectPath }) {
  const project = () => {
    const current = getProjectPath()
    if (!current) throw new Error(t('No project open'))
    return path.resolve(current)
  }
  const folder = () => path.join(project(), '.ow', 'web')
  const indexFile = () => path.join(project(), '.ow', 'web.json')

  function read() {
    try {
      const list = JSON.parse(fs.readFileSync(indexFile(), 'utf8'))
      return (Array.isArray(list) ? list : []).filter((item) => item && typeof item.id === 'string' && typeof item.url === 'string' && typeof item.file === 'string')
    } catch (error) {
      if (error.code === 'ENOENT') return []
      throw new Error(t('{basename} is not valid JSON: fix it or remove it', { basename: 'web.json' }))
    }
  }

  function write(list) {
    fs.mkdirSync(path.dirname(indexFile()), { recursive: true })
    writeFileAtomic(indexFile(), JSON.stringify(list, null, 2))
  }

  const pathOf = (entry) => path.join(folder(), entry.file)
  // Le copie salvate prima dell'intestazione non hanno updatedAt, checkedAt, source e hash: si ricavano da ciò che c'è.
  const normalizeEntry = (entry) => ({ ...entry, siteName: entry.siteName || '', updatedAt: entry.updatedAt || entry.savedAt, checkedAt: entry.checkedAt || entry.updatedAt || entry.savedAt, source: SOURCES.includes(entry.source) ? entry.source : 'user', hash: entry.hash || '' })
  const publicEntry = (entry) => {
    const full = normalizeEntry(entry)
    return { id: full.id, url: full.url, title: full.title, siteName: full.siteName, savedAt: full.savedAt, updatedAt: full.updatedAt, checkedAt: full.checkedAt, source: full.source, hash: full.hash, file: full.file, path: pathOf(full), exists: fs.existsSync(pathOf(full)) }
  }

  // Dal più recente.
  const list = () => read().map(publicEntry).sort((left, right) => String(right.savedAt).localeCompare(String(left.savedAt)))

  const find = (url) => {
    const wanted = normalizeUrl(url)
    if (!wanted) return null
    const entry = read().find((item) => normalizeUrl(item.url) === wanted)
    return entry ? publicEntry(entry) : null
  }

  // Una pagina indicata in uno dei modi in cui si può: id, nome del file (anche `@web/…`), indirizzo o parte del titolo. Più corrispondenze: la più recente.
  function resolve(reference) {
    const wanted = String(reference || '').trim()
    if (!wanted) return null
    const entries = list()
    const lower = wanted.toLowerCase().replace(/^@web\//, '')
    return entries.find((entry) => entry.id === wanted || entry.file.toLowerCase() === lower)
      || find(wanted)
      || entries.find((entry) => entry.title.toLowerCase().includes(lower) || entry.url.toLowerCase().includes(lower))
      || null
  }

  /**
   * Salva una pagina, o la rinfresca se c'è già. `markdown` è il testo già pronto (vedi readerMode.js nell'interfaccia), senza intestazione: la scrive questo modulo.
   * `source`: chi la salva (user, assistant, agent). `checkOnly`: si confronta soltanto con la copia salvata (data di verifica aggiornata, testo no).
   * → la voce, con `change`: 'created' | 'updated' | 'unchanged' | 'changed' (solo con checkOnly: la pagina è diversa, non si è toccato nulla) e, se c'era una copia, `diff` { added, removed }.
   */
  function save({ url, title, markdown, siteName = '', source = 'user', checkOnly = false }) {
    const normalized = normalizeUrl(url)
    if (!normalized) throw new Error(t('Only web pages (http or https) can be saved'))
    const body = String(markdown ?? '').trim().slice(0, MAX_MARKDOWN_CHARS)
    if (!body) throw new Error(t('The page has no text to save'))
    const entries = read()
    const existing = entries.find((item) => normalizeUrl(item.url) === normalized)
    if (!existing && checkOnly) throw new Error(t('This page is not saved: nothing to check'))
    if (!existing && entries.length >= MAX_ENTRIES) throw new Error(t('Too many saved web pages (max {count})', { count: MAX_ENTRIES }))
    const now = new Date().toISOString()
    const hash = hashOf(body)
    const previous = existing ? normalizeEntry(existing) : null
    let change = 'created'
    let diff = null
    if (previous) {
      let oldBody = ''
      try { oldBody = fs.readFileSync(pathOf(previous), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '') } catch { /* copia sparita: si riscrive */ }
      const same = previous.hash ? previous.hash === hash : hashOf(oldBody) === hash
      diff = same ? { added: 0, removed: 0 } : lineDifference(oldBody, body)
      change = same ? 'unchanged' : (checkOnly ? 'changed' : 'updated')
    }
    const name = String(title || '').trim().slice(0, 200) || previous?.title || new URL(normalized).hostname
    const id = previous?.id || crypto.randomBytes(4).toString('hex')
    const file = previous?.file || `${slugify(name) || slugify(new URL(normalized).hostname) || 'page'}-${id}.md`
    const entry = {
      id,
      url: previous?.url || cleanUrl(url),
      title: change === 'changed' ? previous.title : name,
      siteName: String(siteName || previous?.siteName || '').slice(0, 100),
      savedAt: previous?.savedAt || now,
      updatedAt: change === 'created' || change === 'updated' ? now : previous.updatedAt,
      checkedAt: now,
      source: previous?.source || (SOURCES.includes(source) ? source : 'user'),
      hash: change === 'changed' ? previous.hash : hash,
      file,
    }
    // Con `checkOnly` e una pagina cambiata il testo resta com'era (si tocca solo la data di verifica, nell'indice e nell'intestazione).
    const textToWrite = change === 'changed' ? fs.readFileSync(pathOf(previous), 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '').replace(/^\n+/, '') : body
    fs.mkdirSync(folder(), { recursive: true })
    writeFileAtomic(path.join(folder(), file), `${headerOf(entry)}\n${textToWrite}${textToWrite.endsWith('\n') ? '' : '\n'}`)
    write([...entries.filter((item) => item.id !== id), entry])
    return { ...publicEntry(entry), change, ...(diff ? { diff } : {}) }
  }

  function remove(id) {
    const entries = read()
    const entry = entries.find((item) => item.id === id)
    if (!entry) return list()
    try { fs.rmSync(pathOf(entry), { force: true }) } catch { /* già tolto */ }
    write(entries.filter((item) => item.id !== id))
    // L'ultima pagina tolta porta via anche la cartella (e con lei il riferimento `@web`).
    try { if (!fs.readdirSync(folder()).length) fs.rmdirSync(folder()) } catch { /* non vuota o assente */ }
    return list()
  }

  return { list, find, resolve, save, remove, folder, normalizeUrl }
}

// La cartella `.ow/web` di un progetto, se contiene almeno una copia: è ciò che ricerca e lettura trattano come `@web`.
function webFolderOf(directory) {
  const target = path.join(directory, '.ow', 'web')
  try { return fs.readdirSync(target).some((name) => name.toLowerCase().endsWith('.md')) ? target : null } catch { return null }
}

module.exports = { createWebReferencesStore, webFolderOf, normalizeUrl, hashOf }
