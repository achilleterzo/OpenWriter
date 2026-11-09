const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { writeFileAtomic } = require('./atomic-write.cjs')
const { samePath } = require('./path-compare.cjs')
const { limitToMembers } = require('./shared-knowledge.cjs')

/**
 * Gli spazi di lavoro (workspace): un insieme con nome di progetti che fa da FILTRO. L'elenco dei progetti, la Home e la conoscenza che l'assistente e gli agenti esterni
 * possono raggiungere si limitano ai progetti dello spazio attivo. È un filtro di visibilità, non un isolamento (vedi docs/design/workspaces.md).
 *
 * «Tutti» (id `all`) è lo spazio predefinito e virtuale: tutti i progetti dell'elenco, nessun filtro. Un progetto può stare in più spazi; si identifica per percorso.
 *
 * Due file nei dati dell'applicazione (`directory()`):
 *   workspaces.json   le definizioni: { workspaces: [{ id, name, projects: [percorsi] }] }
 *   workspace.json    già esistente: l'ultimo progetto aperto `{ project }`, a cui si aggiungono il filtro attivo `active` e i membri temporanei `temporary`.
 *                     Si SCRIVE SEMPRE unendo i campi: riscrivere solo `{ project }` cancellerebbe il filtro a ogni apertura di un progetto.
 *
 * Lo stato non si tiene in memoria: ogni chiamata legge i file, così anche il server MCP (un altro processo) vede subito un cambio fatto nell'app.
 * Membri temporanei: progetti aperti da un agente mentre uno spazio era attivo; si vedono (segnati) finché l'utente non li aggiunge o li ignora, cambia lo spazio o
 * l'applicazione riparte. Non contano come membri per gli altri (`visibleProjects` senza `temporary` li esclude).
 */
const ALL = 'all'
const MAX_NAME = 60

function createWorkspacesStore({ directory }) {
  const definitionsFile = () => path.join(directory(), 'workspaces.json')
  const stateFile = () => path.join(directory(), 'workspace.json')

  const readJson = (file) => {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch { return {} }
  }
  const write = (file, value) => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    writeFileAtomic(file, JSON.stringify(value, null, 2))
  }
  const unique = (paths) => {
    const result = []
    for (const item of paths) {
      if (typeof item !== 'string' || !item.trim()) continue
      const resolved = path.resolve(item)
      if (!result.some((known) => samePath(known, resolved))) result.push(resolved)
    }
    return result
  }
  const cleanName = (value, fallback = 'Workspace') => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) || fallback

  function readDefinitions() {
    const list = Array.isArray(readJson(definitionsFile()).workspaces) ? readJson(definitionsFile()).workspaces : []
    const seen = new Set([ALL])
    const result = []
    for (const item of list) {
      if (!item || typeof item.id !== 'string' || !item.id || seen.has(item.id)) continue
      seen.add(item.id)
      result.push({ id: item.id, name: cleanName(item.name), projects: unique(Array.isArray(item.projects) ? item.projects : []) })
    }
    return result
  }
  const writeDefinitions = (workspaces) => write(definitionsFile(), { workspaces })
  // Scrittura che unisce i campi: i campi che non conosciamo (e `project`) restano come sono.
  const writeState = (patch) => write(stateFile(), { ...readJson(stateFile()), ...patch })
  const update = (id, change) => {
    const workspaces = readDefinitions()
    const index = workspaces.findIndex((item) => item.id === id)
    if (index === -1) return null
    workspaces[index] = { ...workspaces[index], ...change(workspaces[index]) }
    writeDefinitions(workspaces)
    return workspaces[index]
  }

  const list = () => readDefinitions()
  const get = (id) => readDefinitions().find((item) => item.id === id) || null
  // Per id, o per nome senza badare a maiuscole e spazi.
  const find = (value) => {
    const wanted = String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
    return readDefinitions().find((item) => item.id === String(value) || item.name.toLowerCase() === wanted) || null
  }

  // Lo spazio attivo: un id esistente, altrimenti «Tutti» (anche se quello attivo è stato eliminato).
  function active() {
    const id = readJson(stateFile()).active
    return typeof id === 'string' && get(id) ? id : ALL
  }
  // I percorsi dello spazio attivo; null per «Tutti» (nessun filtro).
  function members() {
    const id = active()
    return id === ALL ? null : get(id).projects
  }
  /**
   * I membri di uno spazio scelto da chi chiede (un agente): non indicato (`undefined`) = lo spazio attivo; `false` (o «all») = tutti i progetti, nessun filtro; un nome (o un id) = quello spazio.
   * null = nessun filtro. Un nome sconosciuto è un errore che elenca quelli che ci sono.
   */
  function membersFor(spec) {
    if (spec === undefined || spec === null || spec === '') return members()
    if (spec === false || /^(false|all)$/i.test(String(spec).trim())) return null
    const found = find(spec)
    if (!found) throw new Error(`Workspace "${spec}" not found. Available: ${['All', ...list().map((item) => item.name)].join(', ')}`)
    return found.projects
  }
  const temporary = () => (active() === ALL ? [] : unique(Array.isArray(readJson(stateFile()).temporary) ? readJson(stateFile()).temporary : []))

  function setActive(id) {
    const next = id !== ALL && get(id) ? id : ALL
    // Cambiando spazio i membri temporanei cadono.
    writeState({ active: next, temporary: [] })
    return next
  }

  function create({ name, projects = [] } = {}) {
    const workspace = { id: crypto.randomBytes(4).toString('hex'), name: cleanName(name), projects: unique(projects) }
    writeDefinitions([...readDefinitions(), workspace])
    return workspace
  }
  const rename = (id, name) => update(id, (current) => ({ name: cleanName(name, current.name) }))
  const setMembers = (id, projects) => update(id, () => ({ projects: unique(projects) }))
  const addProject = (id, project) => update(id, (current) => ({ projects: unique([...current.projects, project]) }))
  const removeProject = (id, project) => update(id, (current) => ({ projects: current.projects.filter((item) => !samePath(item, project)) }))

  function remove(id) {
    const workspaces = readDefinitions()
    if (!workspaces.some((item) => item.id === id)) return false
    writeDefinitions(workspaces.filter((item) => item.id !== id))
    if (readJson(stateFile()).active === id) writeState({ active: ALL, temporary: [] })
    return true
  }

  // Un progetto tolto dall'elenco esce da tutti gli spazi (e dai membri temporanei).
  function removeEverywhere(project) {
    const workspaces = readDefinitions().map((item) => ({ ...item, projects: item.projects.filter((known) => !samePath(known, project)) }))
    writeDefinitions(workspaces)
    const state = readJson(stateFile())
    if (Array.isArray(state.temporary) && state.temporary.some((known) => samePath(known, project))) writeState({ temporary: state.temporary.filter((known) => !samePath(known, project)) })
  }
  // Un progetto spostato conserva il suo posto negli spazi.
  function replacePath(from, to) {
    const swap = (paths) => unique(paths.map((known) => (samePath(known, from) ? to : known)))
    writeDefinitions(readDefinitions().map((item) => ({ ...item, projects: swap(item.projects) })))
    const state = readJson(stateFile())
    if (Array.isArray(state.temporary)) writeState({ temporary: swap(state.temporary) })
  }

  // Membri temporanei. Con «Tutti» attivo non servono: ogni progetto è già visibile.
  function addTemporary(project) {
    if (active() === ALL) return false
    const resolved = path.resolve(String(project))
    if ((members() || []).some((known) => samePath(known, resolved))) return false
    writeState({ temporary: unique([...temporary(), resolved]) })
    return true
  }
  function dismissTemporary(project) {
    writeState({ temporary: temporary().filter((known) => !samePath(known, project)) })
  }
  // L'utente lo aggiunge allo spazio attivo: da temporaneo diventa membro.
  function adoptTemporary(project) {
    const id = active()
    if (id === ALL) return false
    addProject(id, project)
    dismissTemporary(project)
    return true
  }
  const clearTemporary = () => { if (Array.isArray(readJson(stateFile()).temporary) && readJson(stateFile()).temporary.length) writeState({ temporary: [] }) }

  // Un progetto è visibile nello spazio attivo (con «Tutti» ogni progetto lo è).
  const isMember = (project) => { const list = members(); return list === null || list.some((known) => samePath(known, project)) }
  // Un progetto nuovo (creato, o aperto dall'utente per la prima volta) entra nello spazio attivo; con «Tutti» o se già membro non cambia nulla. → true se è stato aggiunto.
  function joinActive(project) {
    const id = active()
    if (id === ALL || isMember(project)) return false
    addProject(id, project)
    dismissTemporary(project)
    return true
  }

  // `workspace.json` ricorda anche l'ultimo progetto aperto: scritto unendo i campi, il filtro non si perde.
  const setLastProject = (project) => writeState({ project })

  /**
   * L'elenco di progetti limitato allo spazio attivo. `granted`: progetti concessi a chi chiede (quelli che un agente ha aperto da sé); `temporary`: includere anche i membri
   * temporanei (l'elenco dell'interfaccia li mostra segnati, la conoscenza condivisa no). Con «Tutti» l'elenco resta com'è.
   */
  const visibleProjects = (projects, { granted = [], temporary: withTemporary = false, workspace } = {}) => limitToMembers(projects, membersFor(workspace), [...granted, ...(withTemporary ? temporary() : [])])

  return {
    ALL, list, get, find, active, members, membersFor, temporary, setActive, create, rename, setMembers, addProject, removeProject, remove, removeEverywhere, replacePath,
    addTemporary, dismissTemporary, adoptTemporary, clearTemporary, isMember, joinActive, setLastProject, visibleProjects,
  }
}

module.exports = { createWorkspacesStore, ALL }
