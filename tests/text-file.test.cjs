const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { decodeText, encodeText, readTextFile, writeTextFile, isBinaryName } = require('../electron/text-file.cjs')

test('decodeText: UTF-8 con o senza firma, e tipo di a capo', () => {
  assert.deepEqual(decodeText(Buffer.from('uno\ndue\n')), { text: 'uno\ndue\n', eol: 'lf', bom: false })
  assert.deepEqual(decodeText(Buffer.from('uno\r\ndue\r\n')), { text: 'uno\ndue\n', eol: 'crlf', bom: false })
  const withBom = decodeText(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('è ok')]))
  assert.deepEqual(withBom, { text: 'è ok', eol: 'lf', bom: true })
  // Più tipi di a capo: vince il prevalente.
  assert.equal(decodeText(Buffer.from('a\r\nb\r\nc\n')).eol, 'crlf')
  assert.equal(decodeText(Buffer.from('a\nb\nc\r\n')).eol, 'lf')
})

test('decodeText: un file binario o non UTF-8 non è testo', () => {
  assert.throws(() => decodeText(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x01])), { code: 'NOT_TEXT' })
  assert.throws(() => decodeText(Buffer.from([0x63, 0x61, 0x66, 0xe9])), { code: 'NOT_TEXT' }, 'Latin-1 non è UTF-8')
})

test('encodeText rimette a capo e firma: nessun cambiamento oltre alle modifiche', () => {
  const original = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('riga 1\r\nriga 2\r\n')])
  const { text, eol, bom } = decodeText(original)
  assert.ok(encodeText(text, { eol, bom }).equals(original), 'a parità di testo il file è identico byte per byte')
  assert.equal(encodeText('x\ny', { eol: 'crlf' }).toString(), 'x\r\ny')
  assert.equal(encodeText('x\ny').toString(), 'x\ny')
})

test('readTextFile e writeTextFile: limite di dimensione, scrittura fedele e permessi conservati', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-text-'))
  try {
    const file = path.join(directory, 'script.sh')
    fs.writeFileSync(file, '#!/bin/sh\r\necho ciao\r\n', { mode: 0o755 })
    const read = await readTextFile(file)
    assert.deepEqual([read.content, read.eol, read.bom], ['#!/bin/sh\necho ciao\n', 'crlf', false])
    writeTextFile(file, read.content.replace('ciao', 'mondo'), { eol: read.eol, bom: read.bom })
    assert.equal(fs.readFileSync(file, 'utf8'), '#!/bin/sh\r\necho mondo\r\n')
    if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o755, 'il file resta eseguibile')
    await assert.rejects(() => readTextFile(file, { limit: 5 }), { code: 'TEXT_TOO_LARGE' })
    await assert.rejects(() => readTextFile(directory), /Not a file/)
    const binary = path.join(directory, 'dati.dat')
    fs.writeFileSync(binary, Buffer.from([1, 2, 0, 3]))
    await assert.rejects(() => readTextFile(binary), { code: 'NOT_TEXT' })
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('isBinaryName: estensioni note non testuali', () => {
  for (const name of ['a.zip', 'B.EXE', 'foto.psd', 'dati.sqlite', 'font.woff2']) assert.equal(isBinaryName(name), true, name)
  for (const name of ['main.js', 'Makefile', '.gitignore', 'config.json', 'log.txt', 'noext', 'a.csv']) assert.equal(isBinaryName(name), false, name)
})
