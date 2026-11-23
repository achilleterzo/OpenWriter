const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { newTextFileName } = require('../electron/text-file.cjs')
const { createProjectTools } = require('../electron/project-tools.cjs')

const RESERVED = ['.docx', '.pdf', '.png', '.jpg']

test('nuovo file di testo: senza estensione diventa .txt, con un\'estensione di testo resta com\'è', () => {
  assert.equal(newTextFileName('note'), 'note.txt')
  assert.equal(newTextFileName('  note  '), 'note.txt')
  assert.equal(newTextFileName('note.txt'), 'note.txt')
  for (const name of ['server.log', 'config.json', 'a.yml', 'script.sh', 'dati.csv', 'Index.HTML', 'x.md']) assert.equal(newTextFileName(name, { reserved: RESERVED }), name)
  assert.equal(newTextFileName('archivio.tar.gz2'.replace('.gz2', '.txt')), 'archivio.tar.txt')
})

test('nuovo file di testo: si rifiutano i tipi binari e quelli che l\'app tratta a parte', () => {
  for (const name of ['a.zip', 'a.exe', 'a.mp3', 'a.xlsx', 'a.ttf', 'A.ZIP']) assert.throws(() => newTextFileName(name, { reserved: RESERVED }), { code: 'BINARY_TYPE' }, name)
  for (const name of ['a.docx', 'a.pdf', 'a.png', 'A.JPG']) assert.throws(() => newTextFileName(name, { reserved: RESERVED }), { code: 'BINARY_TYPE' }, name)
  // Senza l'elenco dei tipi riservati, un .docx o un .png sono accettati: lo decide chi chiama.
  assert.equal(newTextFileName('a.png'), 'a.png')
})

test('nuovo file di testo: nomi non validi', () => {
  for (const name of ['', '   ', null, undefined, '.', '..', '.env', '.gitignore', 'a/b.txt', 'a\\b.txt', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a>b', 'a|b', 'finisce.', 'x\ty'.replace('\t', '/')]) {
    assert.throws(() => newTextFileName(name), { code: 'INVALID_NAME' }, JSON.stringify(name))
  }
})

// ---------- Creazione nel progetto ----------

function project() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-newtext-'))
  return { directory, tools: createProjectTools({ getProjectPath: () => directory, readDocument: async () => ({}) }) }
}

test('creazione: dal file manager l\'estensione è libera, per l\'assistente restano .md e .txt', async () => {
  const { directory, tools } = project()
  // L'assistente: solo .md, .markdown e .txt.
  await assert.rejects(() => tools.createFile('server.log', 'x'), /Only .md and .txt documents can be created/)
  assert.equal((await tools.createFile('note.txt', 'x')).path, 'note.txt')
  assert.equal((await tools.createFile('doc', 'x')).path, 'doc.md')
  // L'utente, dal file manager: il nome è già stato verificato da newTextFileName.
  const created = await tools.createFile('server.log', '', { anyText: true })
  assert.equal(created.path, 'server.log')
  assert.equal(fs.readFileSync(path.join(directory, 'server.log'), 'utf8'), '')
  assert.equal((await tools.createFile('sotto/config.json', '', { anyText: true })).path, 'sotto/config.json')
  assert.ok(fs.existsSync(path.join(directory, 'sotto', 'config.json')))
})

test('creazione: un nome già presente non si sovrascrive, nemmeno cambiando le maiuscole, e non si esce dal progetto', async () => {
  const { tools } = project()
  await tools.createFile('Note.txt', 'uno', { anyText: true })
  await assert.rejects(() => tools.createFile('note.txt', 'due', { anyText: true }), /already exists/)
  await assert.rejects(() => tools.createFile('../fuori.txt', '', { anyText: true }), /outside the project/)
  await assert.rejects(() => tools.createFile('.ow/x.txt', '', { anyText: true }), /not accessible/)
})
