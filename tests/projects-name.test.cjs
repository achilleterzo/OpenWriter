const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createProjectsStore, customName } = require('../electron/projects.cjs')

function workspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-names-'))
  return { root, remove: () => fs.rmSync(root, { recursive: true, force: true }) }
}

const writeSettings = (directory, content) => {
  fs.mkdirSync(path.join(directory, '.ow'), { recursive: true })
  fs.writeFileSync(path.join(directory, '.ow', 'project.json'), typeof content === 'string' ? content : JSON.stringify(content))
}

test('il nome del progetto è quello delle impostazioni, se c\'è; altrimenti la cartella', () => {
  const w = workspace()
  try {
    const named = path.join(w.root, 'cartella-uno')
    const plain = path.join(w.root, 'cartella-due')
    const broken = path.join(w.root, 'cartella-tre')
    const empty = path.join(w.root, 'cartella-quattro')
    for (const directory of [named, plain, broken, empty]) fs.mkdirSync(directory, { recursive: true })
    writeSettings(named, { name: '  Il mio romanzo  ' })
    writeSettings(broken, '{ non json')
    writeSettings(empty, { name: '   ' })
    const store = createProjectsStore({ filePath: () => path.join(w.root, 'projects.json') })
    for (const directory of [named, plain, broken, empty]) store.touch(directory)
    const names = Object.fromEntries(store.list().map((item) => [path.basename(item.path), item.name]))
    assert.deepEqual(names, { 'cartella-uno': 'Il mio romanzo', 'cartella-due': 'cartella-due', 'cartella-tre': 'cartella-tre', 'cartella-quattro': 'cartella-quattro' })
    assert.equal(customName(path.join(w.root, 'non-esiste')), '')
  } finally { w.remove() }
})
