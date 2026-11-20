const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createPasswordStore, originOf, parseCapture, fillScript, CAPTURE_SCRIPT, MARKER } = require('../electron/browser-passwords.cjs')

// "Cifratura" di prova: reversibile, non in chiaro nel file.
const secrets = { available: () => true, encrypt: (text) => Buffer.from(text, 'utf8').reverse().toString('base64'), decrypt: (value) => Buffer.from(value, 'base64').reverse().toString('utf8') }
const setup = (override = {}) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-pw-'))
  return { directory, store: createPasswordStore({ directory, secrets: { ...secrets, ...override } }) }
}

test('password: solo i siti https (o il computer stesso) hanno un\'origine su cui salvare', () => {
  assert.equal(originOf('https://example.com/login?x=1'), 'https://example.com')
  assert.equal(originOf('http://localhost:3000/a'), 'http://localhost:3000')
  assert.equal(originOf('http://example.com/'), '')
  assert.equal(originOf('about:blank'), '')
  assert.equal(originOf('non un indirizzo'), '')
})

test('password: si salva cifrata, si aggiorna per lo stesso sito e utente, e l\'elenco non mostra la password', () => {
  const { store, directory } = setup()
  const id = store.save({ origin: 'https://example.com', username: 'anna', password: 'segreta-1' })
  assert.ok(!fs.readFileSync(path.join(directory, 'browser-passwords.json'), 'utf8').includes('segreta-1'), 'nel file non c\'è in chiaro')
  assert.equal(store.save({ origin: 'https://example.com', username: 'anna', password: 'segreta-2' }), id, 'stesso sito e utente: la stessa voce')
  assert.equal(store.get(id).password, 'segreta-2')
  assert.equal(store.find('https://example.com', 'anna').password, 'segreta-2')
  store.save({ origin: 'https://example.com', username: 'bruno', password: 'x' })
  assert.deepEqual(store.listFor('https://example.com').map((entry) => entry.username).sort(), ['anna', 'bruno'])
  assert.ok(store.list().every((entry) => !('password' in entry) && !('secret' in entry)))
  assert.deepEqual(store.listFor('https://altro.it'), [])
})

test('password: senza cifratura del sistema non si salva nulla; siti e password non validi si rifiutano', () => {
  const { store } = setup({ available: () => false })
  assert.throws(() => store.save({ origin: 'https://example.com', username: 'a', password: 'p' }), /Encryption/)
  const { store: working } = setup()
  assert.throws(() => working.save({ origin: 'http://example.com', username: 'a', password: 'p' }), /Invalid site/)
  assert.throws(() => working.save({ origin: 'https://example.com/path', username: 'a', password: 'p' }), /Invalid site/)
  assert.throws(() => working.save({ origin: 'https://example.com', username: 'a', password: '' }), /Invalid password/)
})

test('password: «Mai» per un sito, ripristinabile; salvare di nuovo toglie il «Mai»; si cancella una voce o tutto', () => {
  const { store } = setup()
  store.addNever('https://example.com')
  assert.equal(store.isNever('https://example.com'), true)
  store.removeNever('https://example.com')
  assert.equal(store.isNever('https://example.com'), false)
  store.addNever('https://example.com')
  const id = store.save({ origin: 'https://example.com', username: 'a', password: 'p' })
  assert.equal(store.isNever('https://example.com'), false)
  store.remove(id)
  assert.equal(store.list().length, 0)
  store.save({ origin: 'https://a.it', username: 'a', password: 'p' })
  store.save({ origin: 'https://b.it', username: 'a', password: 'p' })
  store.clear()
  assert.equal(store.list().length, 0)
})

test('password: la riga di console dello script si riconosce (password e nome utente di un passo precedente) e un testo qualunque no', () => {
  const line = (data) => `${MARKER}${JSON.stringify(data)}`
  assert.deepEqual(parseCapture(line({ kind: 'password', origin: 'https://a.it', username: 'anna', password: 'p' })), { kind: 'password', origin: 'https://a.it', username: 'anna', password: 'p' })
  assert.deepEqual(parseCapture(line({ kind: 'user', origin: 'https://a.it', username: 'anna' })), { kind: 'user', origin: 'https://a.it', username: 'anna' })
  assert.equal(parseCapture(line({ kind: 'user', origin: 'https://a.it', username: '' })), null)
  assert.equal(parseCapture(line({ kind: 'password', origin: 'https://a.it', username: 'a', password: '' })), null)
  assert.equal(parseCapture(line({ kind: 'altro', password: 'p' })), null)
  assert.equal(parseCapture('ciao'), null)
  assert.equal(parseCapture(`${MARKER}{non json`), null)
})

test('password: lo script di compilazione è codice valido con i dati incorporati come testo (anche con apici e virgolette)', () => {
  const code = fillScript({ username: 'a"b\'c', password: 'p\\`${x}' })
  assert.doesNotThrow(() => new Function(`return ${code}`))
  assert.ok(code.includes(JSON.stringify('p\\`${x}')))
})

test('password: lo script di cattura è codice valido', () => {
  assert.doesNotThrow(() => new Function(`return ${CAPTURE_SCRIPT}`))
  assert.ok(CAPTURE_SCRIPT.includes(JSON.stringify(MARKER)))
})
