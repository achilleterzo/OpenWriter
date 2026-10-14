const { execFileSync } = require('node:child_process')
const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { t } = require('./i18n.cjs')
const { writeFileAtomic } = require('./atomic-write.cjs')
const { ownerRoot, parentOwner, looseKey } = require('./project-owner.cjs')

const DIRECTORY_NAME = '.ow'
const FORMAT_VERSION = 1
const MAX_VERSIONS_PER_DOCUMENT = 100
const MAX_CONTEXT_CHARS = 20000

/**
 * La directory `.ow` nella radice del progetto contiene:
 *   project.json                         { name, ai: { language, documentLanguage }, options: { autoVersions } }
 *   context.md                           contesto per l'assistente AI (testo libero)
 *   skills/<id>.md                       skill di scrittura del progetto (vedi skills-store.cjs); quelle attive di default in project.json → skills.active
 *   history/<documento>/index.json       metadati delle versioni di un documento
 *   history/<documento>/<id>.md          contenuto di ogni versione
 * `<documento>` è il percorso del file relativo alla `.ow` che lo possiede (la più vicina, vedi project-owner.cjs): per un file di un
 * sotto-progetto la cronologia sta nella `.ow` del sotto-progetto, qualunque progetto sia aperto.
 * Le chiavi sconosciute di project.json vengono conservate.
 */
const cleanLanguages = (value) => (Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === 'string' && item))] : [])
const cleanSkillIds = (value) => (Array.isArray(value) ? [...new Set(value.filter((item) => typeof item === 'string' && /^[a-z0-9][a-z0-9-]{0,59}$/.test(item)))].slice(0, 50) : [])

// `getMainPath`: cartella del progetto main, che tiene cronologia e note dei documenti fuori dal progetto aperto.
function createProjectFile({ getProjectPath, getMainPath = () => null }) {
  const root = () => {
    const project = getProjectPath()
    if (!project) throw new Error(t('No project open'))
    return path.join(project, DIRECTORY_NAME)
  }
  const settingsFile = () => path.join(root(), 'project.json')
  const contextFile = () => path.join(root(), 'context.md')
  const rootAt = (base) => path.join(base, DIRECTORY_NAME)

  // Su Windows il prefisso "." non nasconde la cartella: serve l'attributo Nascosto (idempotente, una volta per sessione).
  const hiddenRoots = new Set()
  function ensureHidden(base = getProjectPath()) {
    if (process.platform !== 'win32' || !base) return
    const directory = path.join(base, DIRECTORY_NAME)
    if (hiddenRoots.has(directory) || !fs.existsSync(directory)) return
    hiddenRoots.add(directory)
    try { execFileSync('attrib', ['+H', directory], { windowsHide: true, timeout: 5000 }) } catch (error) { console.error('Impossibile nascondere .ow:', error.message) }
  }

  // Scrittura atomica: un crash a metà non lascia un file troncato.
  function writeAtomic(file, content, base) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    writeFileAtomic(file, content)
    ensureHidden(base)
  }

  // Un JSON corrotto blocca l'operazione: riscriverlo cancellerebbe il lavoro dell'utente.
  function readJson(file, fallback) {
    if (!fs.existsSync(file)) return fallback
    try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { throw new Error(t('{basename} is not valid JSON: fix it or remove it', { basename: path.basename(file) })) }
  }

  // `base`: cartella di un altro progetto (un sotto-progetto o un progetto sopra); senza, il progetto aperto.
  function readSettings(base) {
    const parsed = readJson(base ? path.join(rootAt(base), 'project.json') : settingsFile(), {})
    return {
      ...parsed,
      format: FORMAT_VERSION,
      name: typeof parsed.name === 'string' ? parsed.name : '',
      ai: { language: '', documentLanguage: '', ...(parsed.ai && typeof parsed.ai === 'object' ? parsed.ai : {}) },
      options: { autoVersions: true, ...(parsed.options && typeof parsed.options === 'object' ? parsed.options : {}) },
      spellcheck: { languages: [], ...(parsed.spellcheck && typeof parsed.spellcheck === 'object' ? parsed.spellcheck : {}) },
      skills: { ...(parsed.skills && typeof parsed.skills === 'object' ? parsed.skills : {}), active: cleanSkillIds(parsed.skills?.active) },
    }
  }

  // Dove sta la cronologia di un documento: { base: cartella proprietaria della `.ow`, key: percorso relativo a base con "/" };
  // Un documento fuori dal progetto aperto sta nel progetto main (vedi looseKey); null solo senza progetto main.
  function locate(document) {
    if (!document) return null
    const project = getProjectPath()
    const resolved = path.resolve(document)
    if (project) {
      const relative = path.relative(project, resolved)
      if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
        const base = ownerRoot(project, resolved)
        return { base, key: path.relative(base, resolved).split(path.sep).join('/') }
      }
    }
    const main = getMainPath()
    return main ? { base: path.resolve(main), key: looseKey(resolved) } : null
  }

  const historyDirectory = ({ base, key }) => path.join(base, DIRECTORY_NAME, 'history', ...key.split('/'))
  const indexFile = (place) => path.join(historyDirectory(place), 'index.json')
  const readIndex = (place) => {
    const index = readJson(indexFile(place), [])
    return Array.isArray(index) ? index : []
  }

  // Altri file di istruzioni per l'assistente: i .md nella radice di .ow (oltre a context.md), in ordine alfabetico.
  function readExtraContext(base) {
    const directory = base ? rootAt(base) : root()
    try {
      return fs.readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.md$/i.test(entry.name) && entry.name.toLowerCase() !== 'context.md')
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right))
        .slice(0, 10)
        .map((name) => ({ name, text: fs.readFileSync(path.join(directory, name), 'utf8').slice(0, MAX_CONTEXT_CHARS) }))
    } catch { return [] }
  }

  function parentProject() {
    const project = getProjectPath()
    const parent = project ? parentOwner(project) : null
    return parent ? { path: parent, name: readSettings(parent).name || path.basename(parent) } : null
  }

  // Catena di `.ow` (dalla più esterna alla più vicina) per un solo documento, o per il progetto stesso se `document` è null.
  // Dentro il progetto aperto un sotto-progetto eredita dal padre, salvo `inherit: false`. Un progetto aperto da solo
  // (autonomo) risale oltre la propria radice solo se ha `inherit: true`.
  function chainBases(root, document) {
    const relative = document ? path.relative(root, path.resolve(document)) : ''
    const inside = document && relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    let current = inside ? ownerRoot(root, document) : root
    const bases = []
    for (let guard = 0; guard < 16; guard += 1) {
      bases.unshift(current)
      if (current === root || readSettings(current).inherit === false) break
      current = ownerRoot(root, current)
    }
    if (bases[0] === root) {
      let top = root
      for (let guard = 0; guard < 5 && readSettings(top).inherit === true; guard += 1) {
        const parent = parentOwner(top)
        if (!parent) break
        bases.unshift(parent)
        top = parent
      }
    }
    return bases
  }

  /**
   * Contesto dell'assistente per i documenti che gli si mandano (uno, più d'uno, o nessuno = il progetto stesso): le `.ow` coinvolte
   * dalla più esterna alla più vicina. Con più documenti si uniscono le catene di ognuno.
   * Ogni voce: { path (relativo al progetto, '' per la radice, null se fuori dal progetto), name, context, extraContext, language, documentLanguage }.
   */
  function getContextChain(documents) {
    const project = getProjectPath()
    if (!project) return []
    const root = path.resolve(project)
    const list = (Array.isArray(documents) ? documents : [documents]).filter(Boolean)
    // Un documento fuori dal progetto aperto usa le istruzioni del progetto main (se il progetto aperto è il main, solo quelle).
    const main = getMainPath() ? path.resolve(getMainPath()) : null
    const isOutside = (document) => { const relative = path.relative(root, path.resolve(document)); return !relative || relative.startsWith('..') || path.isAbsolute(relative) }
    const chains = list.length ? list.map((document) => (isOutside(document) && main ? (main === root ? chainBases(root, null) : [main]) : chainBases(root, document))) : [chainBases(root, null)]
    const depth = (base) => {
      const relative = path.relative(root, base)
      if (!relative) return 0
      const parts = relative.split(path.sep)
      return relative.startsWith('..') ? -parts.filter((part) => part === '..').length : parts.length
    }
    const bases = [...new Set(chains.flat())].sort((a, b) => depth(a) - depth(b))
    return bases.map((base) => {
      const settings = readSettings(base)
      const contextPath = path.join(rootAt(base), 'context.md')
      const toProject = path.relative(root, base)
      return {
        path: toProject.startsWith('..') || path.isAbsolute(toProject) ? null : toProject.split(path.sep).join('/'),
        base,
        name: settings.name || path.basename(base),
        context: fs.existsSync(contextPath) ? fs.readFileSync(contextPath, 'utf8') : '',
        extraContext: readExtraContext(base),
        language: String(settings.ai.language || ''),
        documentLanguage: String(settings.ai.documentLanguage || ''),
        activeSkills: settings.skills.active,
      }
    })
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
      // Sopra questo progetto c'è un altro progetto (`.ow`)? Se sì, si può scegliere di ereditarne il contesto.
      parent: parentProject(),
      inherit: settings.inherit === true,
      ai: { context, extraContext: readExtraContext(), language: String(settings.ai.language || ''), documentLanguage: String(settings.ai.documentLanguage || '') },
      options: { autoVersions: settings.options.autoVersions !== false },
      spellcheck: { languages: cleanLanguages(settings.spellcheck.languages) },
      skills: { active: settings.skills.active },
    }
  }

  // `skills` è facoltativo: chi non lo passa (es. la copia del contesto) lascia intatte le skill attive.
  function saveSettings({ name, ai, options, spellcheck, inherit, skills } = {}) {
    const settings = readSettings()
    if (inherit !== undefined) settings.inherit = Boolean(inherit)
    settings.name = String(name || '').slice(0, 200)
    settings.ai = { ...settings.ai, language: String(ai?.language || '').slice(0, 50), documentLanguage: String(ai?.documentLanguage || '').slice(0, 50) }
    settings.options = { ...settings.options, autoVersions: options?.autoVersions !== false }
    settings.spellcheck = { ...settings.spellcheck, languages: cleanLanguages(spellcheck?.languages) }
    if (skills !== undefined) settings.skills = { ...settings.skills, active: cleanSkillIds(skills?.active) }
    writeAtomic(settingsFile(), JSON.stringify(settings, null, 2))
    writeAtomic(contextFile(), String(ai?.context || '').slice(0, MAX_CONTEXT_CHARS))
    return getSettings()
  }

  // Skill attive di default: si salvano da sole, senza toccare il resto delle impostazioni.
  function setActiveSkills(active) {
    const settings = readSettings()
    settings.skills = { ...settings.skills, active: cleanSkillIds(active) }
    writeAtomic(settingsFile(), JSON.stringify(settings, null, 2))
    return settings.skills.active
  }

  // Da chiamare all'apertura del progetto: crea .ow con i file di base se mancano, lo nasconde e lascia intatto quanto esiste già.
  function initialize({ inherit } = {}) {
    if (!getProjectPath()) return
    fs.mkdirSync(root(), { recursive: true })
    if (!fs.existsSync(settingsFile())) {
      writeAtomic(settingsFile(), JSON.stringify({ format: FORMAT_VERSION, name: '', ...(inherit === undefined ? {} : { inherit }), ai: { language: '' }, options: { autoVersions: true } }, null, 2))
    }
    if (!fs.existsSync(contextFile())) writeAtomic(contextFile(), '')
    ensureHidden()
  }

  // Rinomina/sposta la cronologia di un file o di una cartella insieme all'elemento, così non resta orfana.
  // Se l'elemento passa da un progetto a un altro (cambia la `.ow` proprietaria) la cronologia lo segue nella nuova `.ow`.
  function moveHistory(from, to) {
    const source = locate(from)
    const target = locate(to)
    if (!source || !target) return false
    const sourceDirectory = historyDirectory(source)
    const destination = historyDirectory(target)
    if (!fs.existsSync(sourceDirectory) || fs.existsSync(destination)) return false
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    try {
      fs.renameSync(sourceDirectory, destination)
    } catch (error) {
      if (error.code !== 'EXDEV') throw error
      fs.cpSync(sourceDirectory, destination, { recursive: true })
      fs.rmSync(sourceDirectory, { recursive: true, force: true })
    }
    ensureHidden(target.base)
    return true
  }

  // Le versioni automatiche seguono le impostazioni del progetto che possiede il documento.
  const autoVersionsEnabled = (document) => readSettings(document ? locate(document)?.base : undefined).options.autoVersions !== false

  function addVersion(document, markdown, { label = '', auto = false } = {}) {
    const place = locate(document)
    if (!place) return null
    const index = readIndex(place)
    const last = index.at(-1)
    if (last && !label) {
      try { if (fs.readFileSync(path.join(historyDirectory(place), `${last.id}.md`), 'utf8') === markdown) return null } catch {}
    }
    const id = crypto.randomUUID()
    writeAtomic(path.join(historyDirectory(place), `${id}.md`), markdown, place.base)
    index.push({ id, at: new Date().toISOString(), label: String(label).slice(0, 120), auto, size: markdown.length })
    // Oltre il limite si scartano prima le versioni automatiche più vecchie, poi le più vecchie in assoluto.
    while (index.length > MAX_VERSIONS_PER_DOCUMENT) {
      const position = index.findIndex((item) => item.auto)
      const [removed] = index.splice(position === -1 ? 0 : position, 1)
      fs.rmSync(path.join(historyDirectory(place), `${removed.id}.md`), { force: true })
    }
    writeAtomic(indexFile(place), JSON.stringify(index, null, 2), place.base)
    return id
  }

  function listVersions(document) {
    const place = locate(document)
    if (!place) return { available: false, versions: [] }
    return { available: true, versions: readIndex(place).slice().reverse() }
  }

  function getVersion(document, id) {
    const place = locate(document)
    // L'id deve esistere nell'indice: così non si può uscire dalla cartella della cronologia.
    if (!place || !readIndex(place).some((item) => item.id === id)) throw new Error(t('Version not found'))
    return fs.readFileSync(path.join(historyDirectory(place), `${id}.md`), 'utf8')
  }

  function deleteVersion(document, id) {
    const place = locate(document)
    if (!place) return false
    const index = readIndex(place)
    if (!index.some((item) => item.id === id)) return false
    fs.rmSync(path.join(historyDirectory(place), `${id}.md`), { force: true })
    const remaining = index.filter((item) => item.id !== id)
    if (remaining.length) writeAtomic(indexFile(place), JSON.stringify(remaining, null, 2), place.base)
    else fs.rmSync(historyDirectory(place), { recursive: true, force: true })
    return true
  }

  return { directoryName: DIRECTORY_NAME, initialize, moveHistory, getSettings, getContextChain, saveSettings, setActiveSkills, autoVersionsEnabled, addVersion, listVersions, getVersion, deleteVersion }
}

module.exports = { createProjectFile }
