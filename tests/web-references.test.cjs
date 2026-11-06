const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createWebReferencesStore, webFolderOf, normalizeUrl } = require('../electron/web-references.cjs')
const { outsideFolders } = require('../electron/shared-knowledge.cjs')

const project = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ow-webrefs-'))

test('normalizeUrl: senza #ancora e parametri di tracciamento, host minuscolo, senza "/" finale; solo http e https', () => {
  assert.equal(normalizeUrl('https://Example.com/Articolo/?utm_source=x&b=2&a=1#sezione'), 'https://example.com/Articolo?a=1&b=2')
  assert.equal(normalizeUrl('https://example.com/'), 'https://example.com')
  assert.equal(normalizeUrl('https://example.com/a?fbclid=1'), 'https://example.com/a')
  assert.equal(normalizeUrl('ftp://example.com/a'), '')
  assert.equal(normalizeUrl('about:blank'), '')
  assert.equal(normalizeUrl('non un indirizzo'), '')
})

test('salvare una pagina: copia in .ow/web, indice in .ow/web.json, stessa pagina → si aggiorna senza doppioni', () => {
  const directory = project()
  try {
    const store = createWebReferencesStore({ getProjectPath: () => directory })
    assert.deepEqual(store.list(), [])
    assert.equal(webFolderOf(directory), null)
    const first = store.save({ url: 'https://example.com/a?utm_medium=z#x', title: 'Un Articolo: Prova', markdown: '# Un articolo\n\ntesto', siteName: 'Esempio' })
    assert.match(first.file, /^un-articolo-prova-[0-9a-f]{8}\.md$/)
    const saved = fs.readFileSync(first.path, 'utf8')
    assert.match(saved, /^---\nurl: https:\/\/example\.com\/a\ntitle: Un Articolo: Prova\nsite: Esempio\nsaved: /)
    assert.match(saved, /\nsaved_by: user\ncontent_hash: [0-9a-f]{16}\n---\n\n# Un articolo\n\ntesto\n$/)
    assert.equal(first.exists, true)
    assert.equal(webFolderOf(directory), path.join(directory, '.ow', 'web'))
    assert.equal(store.find('https://example.com/a')?.id, first.id, 'si ritrova anche senza ancora e parametri')
    assert.equal(store.find('https://example.com/b'), null)
    const again = store.save({ url: 'https://example.com/a', title: 'Titolo nuovo', markdown: '# nuovo' })
    assert.equal(again.id, first.id)
    assert.equal(again.file, first.file, 'lo stesso file')
    assert.equal(store.list().length, 1)
    assert.match(fs.readFileSync(again.path, 'utf8'), /---\n\n# nuovo\n$/)
    assert.equal(JSON.parse(fs.readFileSync(path.join(directory, '.ow', 'web.json'), 'utf8')).length, 1)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('si rifiutano indirizzi non web, pagine senza testo e oltre il massimo', () => {
  const directory = project()
  try {
    const store = createWebReferencesStore({ getProjectPath: () => directory })
    assert.throws(() => store.save({ url: 'file:///x', title: 'x', markdown: 'testo' }), /http or https|http o https/)
    assert.throws(() => store.save({ url: 'https://example.com/', title: 'x', markdown: '   ' }), /no text|non ha testo/)
    assert.equal(fs.existsSync(path.join(directory, '.ow', 'web')), false, 'un rifiuto non lascia nulla')
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('togliere una pagina cancella la copia; l\'ultima toglie anche la cartella (e con lei @web)', () => {
  const directory = project()
  try {
    const store = createWebReferencesStore({ getProjectPath: () => directory })
    const a = store.save({ url: 'https://example.com/a', title: 'A', markdown: 'uno' })
    const b = store.save({ url: 'https://example.com/b', title: 'B', markdown: 'due' })
    assert.equal(store.list().length, 2)
    assert.deepEqual(store.remove(a.id).map((item) => item.id), [b.id])
    assert.equal(fs.existsSync(a.path), false)
    assert.equal(webFolderOf(directory), path.join(directory, '.ow', 'web'))
    store.remove(b.id)
    assert.equal(webFolderOf(directory), null)
    assert.equal(fs.existsSync(path.join(directory, '.ow', 'web')), false)
    assert.deepEqual(store.remove('inesistente'), [], 'togliere ciò che non c\'è non è un errore')
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('un file mancante si segnala (exists: false) e il json rotto dà un errore chiaro', () => {
  const directory = project()
  try {
    const store = createWebReferencesStore({ getProjectPath: () => directory })
    const entry = store.save({ url: 'https://example.com/a', title: 'A', markdown: 'uno' })
    fs.rmSync(entry.path)
    assert.equal(store.list()[0].exists, false)
    fs.writeFileSync(path.join(directory, '.ow', 'web.json'), '{ rotto')
    assert.throws(() => store.list(), /web\.json/)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('@web: le pagine salvate del progetto sono una cartella di riferimento automatica, e quelle degli altri progetti @nome-web', () => {
  const root = path.resolve('/lavoro')
  const webs = new Map([[path.join(root, 'a'), path.join(root, 'a', '.ow', 'web')], [path.join(root, 'b'), path.join(root, 'b', '.ow', 'web')]])
  const webFolder = (directory) => webs.get(directory) || null
  const projects = [{ path: path.join(root, 'a'), name: 'a' }, { path: path.join(root, 'b'), name: 'b' }, { path: path.join(root, 'c'), name: 'c' }]
  const found = outsideFolders({ current: path.join(root, 'a'), references: [], projects, isShared: () => true, webFolderOf: webFolder })
  assert.deepEqual(found.map((item) => item.name), ['web', 'b', 'b-web', 'c'])
  assert.deepEqual(found.map((item) => Boolean(item.web)), [true, false, true, false])
  // Senza pagine salvate non c'è nessuna voce web.
  assert.deepEqual(outsideFolders({ current: path.join(root, 'c'), projects: [projects[2]], isShared: () => true, webFolderOf: () => null }).map((item) => item.name), [])
  // Un riferimento che si chiama già «web» ha la precedenza: la cartella automatica non lo oscura.
  const taken = outsideFolders({ current: path.join(root, 'a'), references: [{ name: 'web', path: path.join(root, 'altro') }], projects: [], isShared: () => true, webFolderOf: webFolder })
  assert.deepEqual(taken.map((item) => [item.name, Boolean(item.web)]), [['web', false]])
})

test('l\'intestazione dice da dove viene e quanto è vecchia; verificare e rinfrescare distinguono invariata, cambiata e aggiornata', () => {
  const directory = project()
  try {
    const store = createWebReferencesStore({ getProjectPath: () => directory })
    const first = store.save({ url: 'https://example.com/a', title: 'A', markdown: '# A\n\nuno\ndue\ntre', source: 'assistant' })
    assert.equal(first.change, 'created')
    assert.equal(first.source, 'assistant')
    assert.equal(first.updatedAt, first.savedAt)
    assert.equal(first.checkedAt, first.savedAt)
    // Lo stesso testo (a meno di spazi): invariata, cambia solo la data di verifica; chi l'aveva salvata resta chi l'ha salvata.
    const same = store.save({ url: 'https://example.com/a', title: 'A', markdown: '# A\n\nuno  due\ntre\n', source: 'user' })
    assert.equal(same.change, 'unchanged')
    assert.deepEqual(same.diff, { added: 0, removed: 0 })
    assert.equal(same.source, 'assistant')
    assert.equal(same.updatedAt, first.updatedAt)
    assert.ok(same.checkedAt >= first.checkedAt)
    // Solo verifica su una pagina cambiata: lo dice, con quante righe, e non tocca il testo.
    const before = fs.readFileSync(first.path, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, '')
    const checked = store.save({ url: 'https://example.com/a', title: 'A', markdown: '# A\n\nuno\nquattro', checkOnly: true })
    assert.equal(checked.change, 'changed')
    assert.deepEqual(checked.diff, { added: 2, removed: 2 })
    assert.equal(fs.readFileSync(first.path, 'utf8').replace(/^---\n[\s\S]*?\n---\n/, ''), before)
    assert.equal(checked.updatedAt, first.updatedAt, 'il contenuto non è stato aggiornato')
    // Rinfrescare: testo nuovo, data di aggiornamento nuova, stessa identità.
    const updated = store.save({ url: 'https://example.com/a', title: 'A', markdown: '# A\n\nuno\nquattro' })
    assert.equal(updated.change, 'updated')
    assert.equal(updated.id, first.id)
    assert.ok(updated.updatedAt >= first.updatedAt)
    assert.equal(updated.savedAt, first.savedAt, 'la data del primo salvataggio resta')
    assert.match(fs.readFileSync(first.path, 'utf8'), /quattro/)
    assert.match(fs.readFileSync(first.path, 'utf8'), /\nsaved_by: assistant\n/)
    assert.throws(() => store.save({ url: 'https://example.com/nuova', title: 'x', markdown: 't', checkOnly: true }), /not saved|non è salvata/)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('resolve: una pagina si indica con id, nome del file (anche @web/…), indirizzo o parte del titolo', () => {
  const directory = project()
  try {
    const store = createWebReferencesStore({ getProjectPath: () => directory })
    const a = store.save({ url: 'https://example.com/guida-ai-fari', title: 'Guida ai fari', markdown: 'testo' })
    store.save({ url: 'https://example.org/altro', title: 'Altro', markdown: 'testo' })
    for (const reference of [a.id, a.file, `@web/${a.file}`, 'https://example.com/guida-ai-fari#x', 'guida ai fari', 'example.com']) assert.equal(store.resolve(reference)?.id, a.id, reference)
    assert.equal(store.resolve('inesistente'), null)
    assert.equal(store.resolve(''), null)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})
