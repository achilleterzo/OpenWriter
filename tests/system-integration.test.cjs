const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createSystemIntegration, PROG_ID } = require('../electron/system-integration.cjs')

const EXE = 'C:\\Program Files\\OpenWriter\\OpenWriter.exe'

// Un registro di Windows finto: `reg add/delete/query` su un oggetto, per provare i comandi senza toccare il sistema.
function fakeRegistry(initial = {}) {
  const keys = new Map(Object.entries(initial).map(([key, values]) => [key.toLowerCase(), { ...values }]))
  const calls = []
  const run = async (file, args) => {
    calls.push([file, ...args])
    if (file !== 'reg') return { code: 1, stdout: '' }
    const [action, key, ...rest] = args
    const id = key.toLowerCase()
    const flag = (name) => { const at = rest.indexOf(name); return at === -1 ? undefined : rest[at + 1] }
    if (action === 'add') {
      const entry = keys.get(id) || {}
      entry[rest.includes('/ve') ? '' : flag('/v')] = flag('/d') ?? ''
      keys.set(id, entry)
      return { code: 0, stdout: '' }
    }
    if (action === 'delete') {
      if (rest.includes('/v')) { const entry = keys.get(id); if (!entry || !(flag('/v') in entry)) return { code: 1, stdout: '' }; delete entry[flag('/v')]; return { code: 0, stdout: '' } }
      if (rest.includes('/ve')) { const entry = keys.get(id); if (!entry) return { code: 1, stdout: '' }; delete entry['']; return { code: 0, stdout: '' } }
      let found = false
      for (const existing of [...keys.keys()]) if (existing === id || existing.startsWith(`${id}\\`)) { keys.delete(existing); found = true }
      return { code: found ? 0 : 1, stdout: '' }
    }
    if (action === 'query') {
      const entry = keys.get(id)
      if (!entry) return { code: 1, stdout: '' }
      const name = rest.includes('/ve') ? '' : flag('/v')
      if (name === undefined) return { code: 0, stdout: `\r\n${key}\r\n` }
      if (!(name in entry)) return { code: 1, stdout: '' }
      return { code: 0, stdout: `\r\n${key}\r\n    ${name === '' ? '(Default)' : name}    REG_SZ    ${entry[name]}\r\n` }
    }
    return { code: 1, stdout: '' }
  }
  return { run, keys, calls }
}

const windows = (registry, extra = {}) => createSystemIntegration({ platform: 'win32', exePath: EXE, packaged: true, run: registry.run, env: {}, ...extra })

test('Windows: l\'associazione dei file Markdown si registra per l\'utente, si riconosce e si toglie', async () => {
  const registry = fakeRegistry()
  const integration = windows(registry)
  let status = await integration.status()
  assert.equal(status.platform, 'win32')
  assert.equal(status.markdown.supported, true)
  assert.equal(status.markdown.registered, false)
  status = await integration.setMarkdown(true)
  assert.equal(status.markdown.registered, true)
  assert.equal(status.markdown.canRemove, true)
  assert.equal(registry.keys.get(`hkcu\\software\\classes\\${PROG_ID}\\shell\\open\\command`.toLowerCase())[''], `"${EXE}" "%1"`)
  for (const extension of ['.md', '.markdown', '.mdown']) {
    assert.ok(PROG_ID in registry.keys.get(`hkcu\\software\\classes\\${extension}\\openwithprogids`), extension)
    assert.equal(registry.keys.get(`hkcu\\software\\classes\\${extension}`)[''], PROG_ID, 'nessun\'altra app: OpenWriter diventa quella registrata')
  }
  assert.ok(registry.calls.every((call) => call[0] === 'reg' && call[2].startsWith('HKCU\\')), 'solo il registro dell\'utente, mai HKLM')
  status = await integration.setMarkdown(false)
  assert.equal(status.markdown.registered, false)
  assert.equal(registry.keys.has(`hkcu\\software\\classes\\${PROG_ID}`.toLowerCase()), false)
  assert.equal(registry.keys.get('hkcu\\software\\classes\\.md')[''], undefined, 'l\'associazione predefinita messa da noi si toglie')
})

test('Windows: un\'altra app già associata resta quella predefinita; OpenWriter va solo in "Apri con"; lo stato dice se è quella scelta dall\'utente', async () => {
  const registry = fakeRegistry({ 'HKCU\\Software\\Classes\\.md': { '': 'Typora.md' } })
  const integration = windows(registry)
  await integration.setMarkdown(true)
  assert.equal(registry.keys.get('hkcu\\software\\classes\\.md')[''], 'Typora.md')
  assert.equal((await integration.status()).markdown.isDefault, false)
  registry.keys.set('hkcu\\software\\microsoft\\windows\\currentversion\\explorer\\fileexts\\.md\\userchoice', { ProgId: PROG_ID })
  assert.equal((await integration.status()).markdown.isDefault, true)
  await integration.setMarkdown(false)
  assert.equal(registry.keys.get('hkcu\\software\\classes\\.md')[''], 'Typora.md', 'non si tocca l\'associazione di un\'altra app')
})

test('Windows: la voce "Apri come progetto" sulle cartelle e sullo sfondo, e solo se punta a questo eseguibile', async () => {
  const registry = fakeRegistry()
  const integration = windows(registry)
  assert.equal((await integration.status()).folder.enabled, false)
  const status = await integration.setFolderMenu(true)
  assert.equal(status.folder.enabled, true)
  assert.equal(registry.keys.get('hkcu\\software\\classes\\directory\\shell\\openwriter\\command')[''], `"${EXE}" "%1"`)
  assert.equal(registry.keys.get('hkcu\\software\\classes\\directory\\background\\shell\\openwriter\\command')[''], `"${EXE}" "%V"`)
  assert.equal((await windows(registry, { exePath: 'D:\\Altro\\OpenWriter.exe' }).status()).folder.enabled, false, 'voce di un\'altra installazione: non conta come attiva')
  assert.equal((await integration.setFolderMenu(false)).folder.enabled, false)
  assert.equal(registry.keys.has('hkcu\\software\\classes\\directory\\shell\\openwriter'), false)
})

test('in sviluppo e su piattaforme senza un modo affidabile non si registra nulla, e si dice perché', async () => {
  const registry = fakeRegistry()
  const dev = createSystemIntegration({ platform: 'win32', exePath: EXE, packaged: false, run: registry.run })
  const devStatus = await dev.status()
  assert.deepEqual([devStatus.markdown.supported, devStatus.markdown.reason, devStatus.folder.supported], [false, 'development', false])
  await assert.rejects(() => dev.setMarkdown(true), /Not supported/)
  const mac = createSystemIntegration({ platform: 'darwin', exePath: '/Applications/OpenWriter.app', packaged: true, run: registry.run })
  const macStatus = await mac.status()
  assert.deepEqual([macStatus.markdown.supported, macStatus.markdown.reason, macStatus.folder.supported, macStatus.folder.reason], [false, 'mac-manual', false, 'mac-manual'])
  await assert.rejects(() => mac.setFolderMenu(true), /Not supported/)
  const other = createSystemIntegration({ platform: 'freebsd', exePath: '/x', packaged: true, run: registry.run })
  assert.equal((await other.status()).markdown.supported, false)
  assert.equal(registry.calls.length, 0, 'nessun comando eseguito')
})

test('Linux: xdg-mime per text/markdown (con il file .desktop dell\'app) e script per Nautilus e Dolphin nella cartella dell\'utente', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-linux-'))
  try {
    const calls = []
    let defaultApp = 'gedit.desktop'
    const run = async (file, args) => {
      calls.push([file, ...args])
      if (file !== 'xdg-mime') return { code: 1, stdout: '' }
      if (args[0] === '--version') return { code: 0, stdout: 'xdg-mime 1.2' }
      if (args[0] === 'query') return { code: 0, stdout: `${defaultApp}\n` }
      if (args[0] === 'default') { defaultApp = args[1]; return { code: 0, stdout: '' } }
      return { code: 1, stdout: '' }
    }
    const make = (extra = {}) => createSystemIntegration({ platform: 'linux', exePath: '/opt/OpenWriter/openwriter', packaged: true, run, home, env: {}, ...extra })
    // Senza il file .desktop non si può associare.
    assert.equal((await make().status()).markdown.reason, 'no-desktop-file')
    fs.mkdirSync(path.join(home, '.local', 'share', 'applications'), { recursive: true })
    fs.writeFileSync(path.join(home, '.local', 'share', 'applications', 'openwriter.desktop'), '[Desktop Entry]\nName=OpenWriter\n')
    const integration = make()
    let status = await integration.status()
    assert.deepEqual([status.markdown.supported, status.markdown.isDefault, status.markdown.canRemove], [true, false, false])
    status = await integration.setMarkdown(true)
    assert.equal(status.markdown.isDefault, true)
    assert.ok(calls.some((call) => call.join(' ') === 'xdg-mime default openwriter.desktop text/markdown'))
    await assert.rejects(() => integration.setMarkdown(false), /cannot be removed/)
    // Voce nel file manager.
    assert.equal((await integration.status()).folder.enabled, false)
    status = await integration.setFolderMenu(true)
    assert.equal(status.folder.enabled, true)
    const script = fs.readFileSync(path.join(home, '.local', 'share', 'nautilus', 'scripts', 'Open as OpenWriter project'), 'utf8')
    assert.match(script, /\/opt\/OpenWriter\/openwriter/)
    assert.ok(fs.statSync(path.join(home, '.local', 'share', 'nautilus', 'scripts', 'Open as OpenWriter project')).mode & 0o100 || process.platform === 'win32', 'eseguibile')
    assert.match(fs.readFileSync(path.join(home, '.local', 'share', 'kio', 'servicemenus', 'openwriter-folder.desktop'), 'utf8'), /MimeType=inode\/directory;/)
    status = await integration.setFolderMenu(false)
    assert.equal(status.folder.enabled, false)
  } finally { fs.rmSync(home, { recursive: true, force: true }) }
})
