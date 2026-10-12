const { execFileSync } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { t } = require('./i18n.cjs')

const DIRECTORY_NAME = '.ow'
const FORMAT_VERSION = 1
const MAX_VERSIONS_PER_DOCUMENT = 100
const MAX_CONTEXT_CHARS = 20000

/**
 * La directory `.ow` nella radice del progetto contiene:
 *   project.json                         { name, ai: { language }, options: { autoVersions } }
 *   context.md                           contesto per l'assistente AI (testo libero)
 *   history/<documento>/index.json       metadati delle versioni di un documento
 *   history/<documento>/<id>.md          contenuto di ogni versione
 * `<documento>` è il percorso del file relativo al progetto, quindi la cronologia rispecchia la struttura delle cartelle.
 * Le chiavi sconosciute di project.json vengono conservate.
 */
const cleanLanguages = (value) => (Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === 'string' && item))] : [])

function createProjectFile({ getProjectPath }) {
  const root = () => {
    const project = getProjectPath()
    if (!project) throw new Error(t('No project open'))
    return path.join(project, DIRECTORY_NAME)
  }
  const settingsFile = () => path.join(root(), 'project.json')
  const contextFile = () => path.join(root(), 'context.md')

  // Su Windows il prefisso "." non nasconde la cartella: serve l'attributo Nascosto (idempotente, una volta per sessione).
  const hiddenRoots = new Set()
  function ensureHidden() {
    if (process.platform !== 'win32') return
    const directory = root()
    if (hiddenRoots.has(directory) || !fs.existsSync(directory)) return
    hiddenRoots.add(directory)
    try { execFileSync('attrib', ['+H', directory], { windowsHide: true, timeout: 5000 }) } catch (error) { console.error('Impossibile nascondere .ow:', error.message) }
  }

  // Scrittura atomica: un crash a metà non lascia un file troncato.
  function writeAtomic(file, content) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const temporary = `${file}.tmp`
    fs.writeFileSync(temporary, content)
    fs.renameSync(temporary, file)
    ensureHidden()
  }

  // Un JSON corrotto blocca l'operazione: riscriverlo cancellerebbe il lavoro dell'utente.
  function readJson(file, fallback) {
    if (!fs.existsSync(file)) return fallback
    try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { throw new Error(t('{basename} is not valid JSON: fix it or remove it', { basename: path.basename(file) })) }
  }

  function readSettings() {
    const parsed = readJson(settingsFile(), {})
    return {
      ...parsed,
      format: FORMAT_VERSION,
      name: typeof parsed.name === 'string' ? parsed.name : '',
      ai: { language: '', ...(parsed.ai && typeof parsed.ai === 'object' ? parsed.ai : {}) },
      options: { autoVersions: true, ...(parsed.options && typeof parsed.options === 'object' ? parsed.options : {}) },
      spellcheck: { languages: [], ...(parsed.spellcheck && typeof parsed.spellcheck === 'object' ? parsed.spellcheck : {}) },
    }
  }

  // Percorso relativo al progetto con "/"; null se il documento è fuori dal progetto.
  function documentKey(document) {
    const project = getProjectPath()
    if (!project || !document) return null
    const relative = path.relative(project, path.resolve(document))
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null
    return relative.split(path.sep).join('/')
  }

  const historyDirectory = (key) => path.join(root(), 'history', ...key.split('/'))
  const indexFile = (key) => path.join(historyDirectory(key), 'index.json')
  const readIndex = (key) => {
    const index = readJson(indexFile(key), [])
    return Array.isArray(index) ? index : []
  }

  function getSettings() {
    if (!getProjectPath()) return { available: false }
    const settings = readSettings()
    const context = fs.existsSync(contextFile()) ? fs.readFileSync(contextFile(), 'utf8') : ''
    return {
      available: true,
      exists: fs.existsSync(root()),
      path: root(),
      name: settings.name,
      ai: { context, language: String(settings.ai.language || '') },
      options: { autoVersions: settings.options.autoVersions !== false },
      spellcheck: { languages: cleanLanguages(settings.spellcheck.languages) },
    }
  }

  function saveSettings({ name, ai, options, spellcheck } = {}) {
    const settings = readSettings()
    settings.name = String(name || '').slice(0, 200)
    settings.ai = { ...settings.ai, language: String(ai?.language || '').slice(0, 50) }
    settings.options = { ...settings.options, autoVersions: options?.autoVersions !== false }
    settings.spellcheck = { ...settings.spellcheck, languages: cleanLanguages(spellcheck?.languages) }
    writeAtomic(settingsFile(), JSON.stringify(settings, null, 2))
    writeAtomic(contextFile(), String(ai?.context || '').slice(0, MAX_CONTEXT_CHARS))
    return getSettings()
  }

  // Da chiamare all'apertura del progetto: crea .ow con i file di base se mancano, lo nasconde e lascia intatto quanto esiste già.
  function initialize() {
    if (!getProjectPath()) return
    fs.mkdirSync(root(), { recursive: true })
    if (!fs.existsSync(settingsFile())) {
      writeAtomic(settingsFile(), JSON.stringify({ format: FORMAT_VERSION, name: '', ai: { language: '' }, options: { autoVersions: true } }, null, 2))
    }
    if (!fs.existsSync(contextFile())) writeAtomic(contextFile(), '')
    ensureHidden()
  }

  // Rinomina/sposta la cronologia di un file o di una cartella insieme all'elemento, così non resta orfana.
  function moveHistory(from, to) {
    const fromKey = documentKey(from)
    const toKey = documentKey(to)
    if (!fromKey || !toKey) return false
    const source = historyDirectory(fromKey)
    const destination = historyDirectory(toKey)
    if (!fs.existsSync(source) || fs.existsSync(destination)) return false
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.renameSync(source, destination)
    return true
  }

  const autoVersionsEnabled = () => readSettings().options.autoVersions !== false

  function addVersion(document, markdown, { label = '', auto = false } = {}) {
    const key = documentKey(document)
    if (!key) return null
    const index = readIndex(key)
    const last = index.at(-1)
    if (last && !label) {
      try { if (fs.readFileSync(path.join(historyDirectory(key), `${last.id}.md`), 'utf8') === markdown) return null } catch {}
    }
    const id = crypto.randomUUID()
    writeAtomic(path.join(historyDirectory(key), `${id}.md`), markdown)
    index.push({ id, at: new Date().toISOString(), label: String(label).slice(0, 120), auto, size: markdown.length })
    // Oltre il limite si scartano prima le versioni automatiche più vecchie, poi le più vecchie in assoluto.
    while (index.length > MAX_VERSIONS_PER_DOCUMENT) {
      const position = index.findIndex((item) => item.auto)
      const [removed] = index.splice(position === -1 ? 0 : position, 1)
      fs.rmSync(path.join(historyDirectory(key), `${removed.id}.md`), { force: true })
    }
    writeAtomic(indexFile(key), JSON.stringify(index, null, 2))
    return id
  }

  function listVersions(document) {
    const key = documentKey(document)
    if (!key) return { available: false, versions: [] }
    return { available: true, versions: readIndex(key).slice().reverse() }
  }

  function getVersion(document, id) {
    const key = documentKey(document)
    // L'id deve esistere nell'indice: così non si può uscire dalla cartella della cronologia.
    if (!key || !readIndex(key).some((item) => item.id === id)) throw new Error(t('Version not found'))
    return fs.readFileSync(path.join(historyDirectory(key), `${id}.md`), 'utf8')
  }

  function deleteVersion(document, id) {
    const key = documentKey(document)
    if (!key) return false
    const index = readIndex(key)
    if (!index.some((item) => item.id === id)) return false
    fs.rmSync(path.join(historyDirectory(key), `${id}.md`), { force: true })
    const remaining = index.filter((item) => item.id !== id)
    if (remaining.length) writeAtomic(indexFile(key), JSON.stringify(remaining, null, 2))
    else fs.rmSync(historyDirectory(key), { recursive: true, force: true })
    return true
  }

  return { directoryName: DIRECTORY_NAME, initialize, moveHistory, getSettings, saveSettings, autoVersionsEnabled, addVersion, listVersions, getVersion, deleteVersion }
}

module.exports = { createProjectFile }
