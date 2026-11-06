const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const load = (file) => import(pathToFileURL(path.join(__dirname, '..', file)).href)

test('indirizzi non pubblici: IPv4, IPv6 in ogni forma, nomi locali', async () => {
  const { isPrivateHost } = await load('electron/private-address.mjs')
  for (const host of ['localhost', 'localhost.', 'app.localhost', 'nas.local', 'x.internal', '127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1',
    '[::1]', '[::]', '[::ffff:7f00:1]', '[::ffff:a00:1]', '[fe80::1]', '[fd12:3456::1]', '[fc00::1]', '[ff02::1]', '[64:ff9b::7f00:1]', '[2002:7f00:1::]', '']) {
    assert.equal(isPrivateHost(host), true, host)
  }
  for (const host of ['example.com', '8.8.8.8', '172.32.0.1', '100.63.0.1', '[2606:4700:4700::1111]', '[::ffff:808:808]', '1.1.1.1']) assert.equal(isPrivateHost(host), false, host)
  // Le forme che URL riscrive (decimale, esadecimale, mappato) arrivano già canoniche.
  for (const address of ['http://2130706433/', 'http://0x7f.1/', 'http://[::ffff:127.0.0.1]/', 'http://LOCALHOST./']) assert.equal(isPrivateHost(new URL(address).hostname), true, address)
})

test('publicWebAddress rifiuta le reti private e accetta le pagine pubbliche', async () => {
  const { publicWebAddress } = await load('src/lib/webAddress.js')
  assert.equal(publicWebAddress(' https://example.com/a ').href, 'https://example.com/a')
  for (const bad of ['http://[::1]:3000/', 'http://[::ffff:7f00:1]/', 'file:///etc/passwd', 'not a url']) assert.throws(() => publicWebAddress(bad), undefined, bad)
})

test('percorsi dei collegamenti: caratteri riservati codificati e ritrovati', async () => {
  const { linkForDocument, resolveDocumentLink, sourceForImage, displaySource } = await load('src/lib/imagePaths.js')
  const documentPath = 'C:/Progetto/Cap 1/doc.md'
  const target = 'C:/Progetto/Note/Idea #1 (bozza)?.md'
  const link = linkForDocument(target, documentPath)
  assert.equal(link, '../Note/Idea%20%231%20%28bozza%29%3F.md')
  assert.deepEqual(resolveDocumentLink(`${link}#Titolo`, documentPath), { kind: 'file', path: target, fragment: 'Titolo' })
  const image = sourceForImage('D:/Foto/a#b.png', documentPath, 'C:/Progetto')
  assert.equal(image, 'file:///D:/Foto/a%23b.png')
  assert.equal(displaySource(image, documentPath), `ow-file://local/${encodeURIComponent('D:/Foto/a#b.png')}`)
  assert.equal(resolveDocumentLink('Nota%20semplice.md', documentPath).path, 'C:/Progetto/Cap 1/Nota semplice.md')
})
