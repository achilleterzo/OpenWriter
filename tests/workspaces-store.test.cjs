const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createWorkspacesStore } = require('../electron/workspaces-store.cjs')
const { limitToMembers } = require('../electron/shared-knowledge.cjs')

const setup = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-workspaces-'))
  return { directory, store: createWorkspacesStore({ directory: () => directory }), cleanup: () => fs.rmSync(directory, { recursive: true, force: true }) }
}
const projects = ['/p/uno', '/p/due', '/p/tre', '/p/quattro'].map((item) => ({ path: path.resolve(item), name: path.basename(item) }))
const paths = (list) => list.map((item) => path.basename(item.path))

test('workspaces-store: crea, rinomina, aggiorna e toglie gli spazi; «Tutti» è virtuale', () => {
  const { store, cleanup } = setup()
  try {
    assert.deepEqual(store.list(), [])
    assert.equal(store.active(), 'all')
    assert.equal(store.members(), null, '«Tutti»: nessun filtro')
    const book = store.create({ name: '  Libro   uno ', projects: ['/p/uno', '/p/due', '/p/uno'] })
    assert.equal(book.name, 'Libro uno')
    assert.deepEqual(store.get(book.id).projects.map((item) => path.basename(item)), ['uno', 'due'], 'senza doppioni')
    assert.equal(store.create({ name: '   ' }).name, 'Workspace', 'un nome vuoto prende quello predefinito')
    store.rename(book.id, 'Saga')
    assert.equal(store.get(book.id).name, 'Saga')
    store.addProject(book.id, '/p/tre')
    store.removeProject(book.id, '/p/uno')
    assert.deepEqual(store.get(book.id).projects.map((item) => path.basename(item)), ['due', 'tre'])
    store.setMembers(book.id, ['/p/quattro'])
    assert.deepEqual(store.get(book.id).projects.map((item) => path.basename(item)), ['quattro'])
    assert.equal(store.remove(book.id), true)
    assert.equal(store.remove(book.id), false)
    assert.equal(store.list().length, 1)
  } finally { cleanup() }
})

test('workspaces-store: lo spazio attivo filtra l\'elenco; «Tutti» e uno spazio eliminato non filtrano', () => {
  const { store, cleanup } = setup()
  try {
    const a = store.create({ name: 'A', projects: ['/p/uno', '/p/due'] })
    store.create({ name: 'B', projects: ['/p/tre'] })
    assert.deepEqual(paths(store.visibleProjects(projects)), ['uno', 'due', 'tre', 'quattro'])
    store.setActive(a.id)
    assert.equal(store.active(), a.id)
    assert.deepEqual(paths(store.visibleProjects(projects)), ['uno', 'due'])
    assert.equal(store.setActive('inesistente'), 'all', 'un id sconosciuto torna a «Tutti»')
    store.setActive(a.id)
    store.remove(a.id)
    assert.equal(store.active(), 'all', 'eliminato lo spazio attivo si torna a «Tutti»')
    assert.deepEqual(paths(store.visibleProjects(projects)), ['uno', 'due', 'tre', 'quattro'])
  } finally { cleanup() }
})

test('workspaces-store: la scrittura unisce i campi e il filtro sopravvive all\'apertura di un progetto', () => {
  const { directory, store, cleanup } = setup()
  try {
    const file = path.join(directory, 'workspace.json')
    fs.writeFileSync(file, JSON.stringify({ project: '/p/vecchio', altro: 7 }))
    const a = store.create({ name: 'A', projects: ['/p/uno'] })
    store.setActive(a.id)
    store.setLastProject('/p/nuovo')
    const state = JSON.parse(fs.readFileSync(file, 'utf8'))
    assert.equal(state.project, '/p/nuovo')
    assert.equal(state.active, a.id, 'il filtro attivo non si perde')
    assert.equal(state.altro, 7, 'i campi sconosciuti restano')
    assert.equal(store.active(), a.id)
  } finally { cleanup() }
})

test('workspaces-store: un progetto tolto dall\'elenco esce da tutti gli spazi, uno spostato resta al suo posto', () => {
  const { store, cleanup } = setup()
  try {
    const a = store.create({ name: 'A', projects: ['/p/uno', '/p/due'] })
    const b = store.create({ name: 'B', projects: ['/p/due', '/p/tre'] })
    store.removeEverywhere('/p/due')
    assert.deepEqual(store.get(a.id).projects.map((item) => path.basename(item)), ['uno'])
    assert.deepEqual(store.get(b.id).projects.map((item) => path.basename(item)), ['tre'])
    store.replacePath('/p/uno', '/q/uno-spostato')
    assert.deepEqual(store.get(a.id).projects.map((item) => path.basename(item)), ['uno-spostato'])
  } finally { cleanup() }
})

test('workspaces-store: i membri temporanei si vedono nell\'elenco ma non nella conoscenza condivisa', () => {
  const { store, cleanup } = setup()
  try {
    const a = store.create({ name: 'A', projects: ['/p/uno'] })
    assert.equal(store.addTemporary('/p/due'), false, 'con «Tutti» non servono')
    store.setActive(a.id)
    assert.equal(store.addTemporary('/p/uno'), false, 'un membro non è temporaneo')
    assert.equal(store.addTemporary('/p/due'), true)
    assert.deepEqual(paths(store.visibleProjects(projects, { temporary: true })), ['uno', 'due'], 'l\'elenco li mostra')
    assert.deepEqual(paths(store.visibleProjects(projects)), ['uno'], 'gli altri non li vedono')
    // L'agente che l'ha aperto lo vede (concessione), gli altri no.
    assert.deepEqual(paths(store.visibleProjects(projects, { granted: ['/p/due'] })), ['uno', 'due'])
    // Cambiando spazio cadono; aggiungendolo diventa membro.
    store.setActive(a.id)
    assert.deepEqual(store.temporary(), [])
    store.addTemporary('/p/tre')
    assert.equal(store.adoptTemporary('/p/tre'), true)
    assert.deepEqual(store.get(a.id).projects.map((item) => path.basename(item)), ['uno', 'tre'])
    assert.deepEqual(store.temporary(), [])
    store.addTemporary('/p/quattro')
    store.dismissTemporary('/p/quattro')
    assert.deepEqual(store.temporary(), [])
    store.addTemporary('/p/quattro')
    store.clearTemporary()
    assert.deepEqual(store.temporary(), [])
  } finally { cleanup() }
})

test('workspaces-store: i file rovinati non rompono nulla', () => {
  const { directory, store, cleanup } = setup()
  try {
    fs.writeFileSync(path.join(directory, 'workspaces.json'), '{non è json')
    fs.writeFileSync(path.join(directory, 'workspace.json'), '[]')
    assert.deepEqual(store.list(), [])
    assert.equal(store.active(), 'all')
    fs.writeFileSync(path.join(directory, 'workspaces.json'), JSON.stringify({ workspaces: [null, { id: 5 }, { id: 'all', name: 'x' }, { id: 'ok', name: 'Buono', projects: ['/p/uno', 3, ''] }, { id: 'ok', name: 'doppio' }] }))
    assert.deepEqual(store.list().map((item) => item.id), ['ok'], 'scartati i non validi, «all» riservato e i doppioni')
    assert.equal(store.list()[0].projects.length, 1)
    const created = store.create({ name: 'Nuovo' })
    assert.ok(created.id && created.id !== 'all')
  } finally { cleanup() }
})

test('workspaces-store: legge i file a ogni chiamata, quindi un altro processo vede subito i cambi', () => {
  const { directory, store, cleanup } = setup()
  try {
    const other = createWorkspacesStore({ directory: () => directory })
    const a = store.create({ name: 'A', projects: ['/p/uno'] })
    assert.deepEqual(other.list().map((item) => item.id), [a.id])
    store.setActive(a.id)
    assert.equal(other.active(), a.id)
    assert.deepEqual(paths(other.visibleProjects(projects)), ['uno'])
    store.setActive('all')
    assert.equal(other.members(), null)
  } finally { cleanup() }
})

test('limitToMembers: null non filtra, i percorsi si confrontano come percorsi, le concessioni si aggiungono', () => {
  assert.equal(limitToMembers(projects, null), projects)
  assert.deepEqual(paths(limitToMembers(projects, [path.resolve('/p/due')])), ['due'])
  assert.deepEqual(paths(limitToMembers(projects, [], [path.resolve('/p/tre')])), ['tre'])
  assert.deepEqual(limitToMembers([null, { name: 'senza percorso' }], [path.resolve('/p/due')]), [])
})

test('workspaces-store: joinActive aggiunge un progetto nuovo allo spazio attivo, e solo a quello', () => {
  const { store, cleanup } = setup()
  try {
    assert.equal(store.joinActive('/p/uno'), false, "con «Tutti» non c'è nulla da aggiungere")
    assert.equal(store.isMember('/p/uno'), true, 'con «Tutti» ogni progetto è visibile')
    const a = store.create({ name: 'A', projects: ['/p/uno'] })
    const b = store.create({ name: 'B', projects: [] })
    store.setActive(a.id)
    assert.equal(store.isMember('/p/due'), false)
    assert.equal(store.joinActive('/p/uno'), false, 'già membro')
    assert.equal(store.joinActive('/p/due'), true)
    assert.equal(store.isMember('/p/due'), true)
    assert.deepEqual(store.get(a.id).projects.map((item) => path.basename(item)), ['uno', 'due'])
    assert.deepEqual(store.get(b.id).projects, [], 'gli altri spazi non cambiano')
    // Un membro temporaneo che entra davvero non resta temporaneo.
    store.addTemporary('/p/tre')
    assert.equal(store.joinActive('/p/tre'), true)
    assert.deepEqual(store.temporary(), [])
  } finally { cleanup() }
})
