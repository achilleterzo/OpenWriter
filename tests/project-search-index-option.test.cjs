const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createProjectFile } = require('../electron/project-file.cjs')

test('options.searchIndex: attivo di default, si spegne per progetto, resta se le impostazioni si salvano senza', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-option-'))
  try {
    const file = createProjectFile({ getProjectPath: () => directory })
    file.initialize()
    assert.equal(file.getSettings().options.searchIndex, true)
    assert.equal(file.searchIndexEnabled(), true)
    const base = { name: 'P', ai: { context: '' }, spellcheck: { languages: [] } }
    assert.equal(file.saveSettings({ ...base, options: { autoVersions: true, searchIndex: false } }).options.searchIndex, false)
    assert.equal(file.searchIndexEnabled(), false)
    // Copia del contesto o altre scritture che non indicano l'opzione: la scelta resta.
    assert.equal(file.saveSettings({ ...base }).options.searchIndex, false)
    assert.equal(file.saveSettings({ ...base, options: { autoVersions: false } }).options.searchIndex, false)
    assert.equal(file.saveSettings({ ...base, options: { searchIndex: true } }).options.searchIndex, true)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})
