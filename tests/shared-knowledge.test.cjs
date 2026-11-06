const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { sharedProjects } = require('../electron/shared-knowledge.cjs')
const { createProjectFile } = require('../electron/project-file.cjs')

const R = path.resolve('/lavoro')
const entry = (name, extra = {}) => ({ path: path.join(R, name), name, missing: false, ...extra })

test('sharedProjects: tutti gli altri progetti che condividono, con sigla unica', () => {
  const found = sharedProjects({ current: path.join(R, 'a'), projects: [entry('a'), entry('b'), entry('Saggio Uno')], isShared: () => true })
  assert.deepEqual(found.map((item) => item.name), ['b', 'Saggio-Uno'])
  assert.deepEqual(found.map((item) => item.path), [path.join(R, 'b'), path.join(R, 'Saggio Uno')])
})

test('sharedProjects: chi non condivide, chi non esiste, il progetto aperto e i progetti annidati restano fuori', () => {
  const projects = [entry('a'), entry('a/sotto'), entry('b'), entry('perso', { missing: true }), entry('riservato'), entry('padre'), entry('padre/a2')]
  const isShared = (directory) => !directory.endsWith('riservato')
  assert.deepEqual(sharedProjects({ current: path.join(R, 'a'), projects, isShared }).map((item) => item.name), ['b', 'padre', 'a2'])
  // Un progetto che ne contiene un altro non viene indicizzato due volte: se quello aperto sta dentro `padre`, `padre` è escluso.
  assert.deepEqual(sharedProjects({ current: path.join(R, 'padre', 'a2'), projects, isShared }).map((item) => item.name), ['a', 'sotto', 'b'])
})

test('sharedProjects: sigla diversa da quelle dei riferimenti e degli altri progetti; un riferimento già collegato non si ripete', () => {
  const references = [{ name: 'b', path: path.join(R, 'altrove', 'x') }, { name: 'c', path: path.join(R, 'c') }]
  const projects = [entry('a'), entry('b'), entry('c'), entry('x/b')]
  const found = sharedProjects({ current: path.join(R, 'a'), projects, references, isShared: () => true })
  // `c` è già collegato come riferimento (stessa cartella): non compare. Le altre sigle evitano `b`.
  assert.deepEqual(found.map((item) => item.name), ['b-2', 'b-3'])
  assert.deepEqual(found.map((item) => item.path), [path.join(R, 'b'), path.join(R, 'x', 'b')])
})

test('sharedProjects: un errore nel leggere le impostazioni di un progetto lo lascia fuori, non rompe la ricerca', () => {
  const found = sharedProjects({ current: path.join(R, 'a'), projects: [entry('b'), entry('c')], isShared: (directory) => { if (directory.endsWith('b')) throw new Error('json rotto'); return true } })
  assert.deepEqual(found.map((item) => item.name), ['c'])
})

test('options.sharedKnowledge: acceso di default, serve anche l\'indice, resta se le impostazioni si salvano senza', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-shared-'))
  try {
    const file = createProjectFile({ getProjectPath: () => directory })
    file.initialize()
    assert.equal(file.getSettings().options.sharedKnowledge, true)
    assert.equal(file.sharedKnowledgeEnabled(), true)
    const base = { name: 'P', ai: { context: '' }, spellcheck: { languages: [] } }
    assert.equal(file.saveSettings({ ...base, options: { sharedKnowledge: false } }).options.sharedKnowledge, false)
    assert.equal(file.sharedKnowledgeEnabled(), false)
    assert.equal(file.saveSettings({ ...base }).options.sharedKnowledge, false)
    assert.equal(file.saveSettings({ ...base, options: { sharedKnowledge: true } }).options.sharedKnowledge, true)
    // Con l'indice spento il progetto non è cercabile da nessuno, qualunque cosa dica l'altra opzione.
    file.saveSettings({ ...base, options: { searchIndex: false, sharedKnowledge: true } })
    assert.equal(file.sharedKnowledgeEnabled(), false)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})
