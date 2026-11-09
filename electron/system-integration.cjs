const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

/**
 * Integrazione con il sistema operativo, per piattaforma: associare i file Markdown a OpenWriter e aggiungere al file manager la voce «Apri come progetto OpenWriter»
 * sulle cartelle. Ogni piattaforma ha il suo modo, e dove non c'è un modo affidabile e consentito si dice (`supported: false` con un motivo) invece di fingere:
 *
 *   Windows  registro dell'utente (HKCU\Software\Classes, nessun permesso di amministratore): un ProgID `OpenWriter.Markdown` offerto in «Apri con» per .md, .markdown e .mdown
 *            (e impostato come predefinito dove nessun'altra app lo è); la scelta dell'app predefinita resta dell'utente (Windows non permette di imporla): lo stato dice se OpenWriter
 *            lo è già e l'interfaccia apre «App predefinite». Voci «Apri come progetto OpenWriter» su cartelle e sullo sfondo di una cartella (Esplora risorse).
 *   Linux    `xdg-mime` per text/markdown (serve il file .desktop dell'app, che c'è nel pacchetto installato); voce nel file manager con uno script per Nautilus (GNOME) e un
 *            menu di servizio per Dolphin (KDE), nella cartella dell'utente.
 *   macOS    nessuno dei due si può fare da dentro l'app senza strumenti esterni: i tipi di documento sono già dichiarati nel pacchetto (voce «Apri con» del Finder) e
 *            l'app predefinita si sceglie dal Finder («Ottieni informazioni» → «Apri con» → «Cambia tutto…»).
 *
 * Nella versione in sviluppo non si registra nulla (il percorso dell'eseguibile sarebbe quello di Electron, non dell'app). Dipendenze iniettabili per le prove:
 * `run(file, args)` → { code, stdout } (di norma `execFile`), `fsImpl`, `home`.
 */
const EXTENSIONS = ['.md', '.markdown', '.mdown']
const PROG_ID = 'OpenWriter.Markdown'
const FOLDER_LABEL = 'Open as OpenWriter project'
const MARKDOWN_MIME = 'text/markdown'
const DESKTOP_ID = 'openwriter.desktop'

function createSystemIntegration({ platform = process.platform, exePath, packaged = false, run, fsImpl = fs, home = os.homedir(), env = process.env, label = FOLDER_LABEL } = {}) {
  const exe = env.APPIMAGE || exePath
  // `label`: il testo della voce nel file manager, nella lingua dell'app al momento di registrarla (una stringa o una funzione). Il nome dello script di Nautilus resta fisso.
  const menuLabel = () => (typeof label === 'function' ? label() : label)
  const reg = async (args) => run('reg', args)
  const registryValue = async (key, name) => {
    const result = await reg(['query', key, ...(name ? ['/v', name] : ['/ve'])]).catch(() => ({ code: 1, stdout: '' }))
    if (result.code !== 0) return null
    const line = String(result.stdout).split(/\r?\n/).find((entry) => /^\s+\S+\s+REG_\w+/.test(entry))
    const value = line ? line.replace(/^\s+\S+\s+REG_\w+\s*/, '').trim() : ''
    return value === '(value not set)' ? '' : value
  }
  const registryKeyExists = async (key) => (await reg(['query', key]).catch(() => ({ code: 1 }))).code === 0

  const unsupported = (reason) => ({ supported: false, reason })
  const environment = () => (packaged ? null : 'development')

  // ----- Windows -----
  const windows = {
    markdownSupport: () => (environment() ? unsupported(environment()) : { supported: true }),
    async markdownStatus() {
      const registered = (await registryValue(`HKCU\\Software\\Classes\\.md\\OpenWithProgids`, PROG_ID)) !== null
      const choice = await registryValue('HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\FileExts\\.md\\UserChoice', 'ProgId')
      return { registered, isDefault: choice === PROG_ID, canRemove: true }
    },
    async setMarkdown(on) {
      const classes = 'HKCU\\Software\\Classes'
      if (on) {
        await reg(['add', `${classes}\\${PROG_ID}`, '/ve', '/d', 'Markdown document', '/f'])
        await reg(['add', `${classes}\\${PROG_ID}\\DefaultIcon`, '/ve', '/d', `"${exe}",0`, '/f'])
        await reg(['add', `${classes}\\${PROG_ID}\\shell\\open\\command`, '/ve', '/d', `"${exe}" "%1"`, '/f'])
        for (const extension of EXTENSIONS) {
          await reg(['add', `${classes}\\${extension}\\OpenWithProgids`, '/v', PROG_ID, '/t', 'REG_NONE', '/f'])
          // Dove nessun'altra app è registrata per l'estensione, OpenWriter lo diventa; altrimenti resta nella lista «Apri con» e sceglie l'utente.
          const current = await registryValue(`${classes}\\${extension}`)
          if (current === null || current === '') await reg(['add', `${classes}\\${extension}`, '/ve', '/d', PROG_ID, '/f'])
        }
      } else {
        for (const extension of EXTENSIONS) {
          await reg(['delete', `${classes}\\${extension}\\OpenWithProgids`, '/v', PROG_ID, '/f']).catch(() => {})
          if ((await registryValue(`${classes}\\${extension}`)) === PROG_ID) await reg(['delete', `${classes}\\${extension}`, '/ve', '/f']).catch(() => {})
        }
        await reg(['delete', `${classes}\\${PROG_ID}`, '/f']).catch(() => {})
      }
    },
    folderSupport: () => (environment() ? unsupported(environment()) : { supported: true }),
    async folderEnabled() {
      const command = await registryValue('HKCU\\Software\\Classes\\Directory\\shell\\OpenWriter\\command')
      return command !== null && command.includes(exe)
    },
    async setFolderMenu(on) {
      const entries = [['Directory\\shell\\OpenWriter', '%1'], ['Directory\\Background\\shell\\OpenWriter', '%V']]
      for (const [key, argument] of entries) {
        const full = `HKCU\\Software\\Classes\\${key}`
        if (on) {
          await reg(['add', full, '/ve', '/d', menuLabel(), '/f'])
          await reg(['add', full, '/v', 'Icon', '/d', `"${exe}"`, '/f'])
          await reg(['add', `${full}\\command`, '/ve', '/d', `"${exe}" "${argument}"`, '/f'])
        } else {
          await reg(['delete', full, '/f']).catch(() => {})
        }
      }
    },
  }

  // ----- Linux -----
  const desktopFile = () => [path.join(home, '.local', 'share', 'applications', DESKTOP_ID), `/usr/share/applications/${DESKTOP_ID}`].find((file) => fsImpl.existsSync(file)) || null
  const nautilusScript = () => path.join(home, '.local', 'share', 'nautilus', 'scripts', FOLDER_LABEL)
  const dolphinMenu = () => path.join(home, '.local', 'share', 'kio', 'servicemenus', 'openwriter-folder.desktop')
  const linux = {
    async markdownSupport() {
      if (environment()) return unsupported(environment())
      if (!desktopFile()) return unsupported('no-desktop-file')
      const probe = await run('xdg-mime', ['--version']).catch(() => ({ code: 1 }))
      return probe.code === 0 ? { supported: true } : unsupported('no-xdg-mime')
    },
    async markdownStatus() {
      const result = await run('xdg-mime', ['query', 'default', MARKDOWN_MIME]).catch(() => ({ code: 1, stdout: '' }))
      const isDefault = result.code === 0 && String(result.stdout).trim() === DESKTOP_ID
      // `xdg-mime` non sa togliere un'associazione né ricordare l'app di prima: per cambiarla si sceglie un'altra app dal file manager.
      return { registered: isDefault, isDefault, canRemove: false }
    },
    async setMarkdown(on) {
      if (!on) throw new Error('This association cannot be removed from here: choose another app in the file manager')
      await run('xdg-mime', ['default', DESKTOP_ID, MARKDOWN_MIME])
    },
    folderSupport: () => (environment() ? unsupported(environment()) : { supported: true }),
    async folderEnabled() { return fsImpl.existsSync(nautilusScript()) || fsImpl.existsSync(dolphinMenu()) },
    async setFolderMenu(on) {
      if (on) {
        fsImpl.mkdirSync(path.dirname(nautilusScript()), { recursive: true })
        fsImpl.writeFileSync(nautilusScript(), `#!/bin/sh\n# Aggiunto da OpenWriter (Impostazioni → Associazioni).\nIFS='\n'\nfor folder in $NAUTILUS_SCRIPT_SELECTED_FILE_PATHS; do\n  [ -d "$folder" ] && "${exe.replace(/"/g, '\\"')}" "$folder" &\ndone\n[ -z "$NAUTILUS_SCRIPT_SELECTED_FILE_PATHS" ] && [ -n "$NAUTILUS_SCRIPT_CURRENT_URI" ] && "${exe.replace(/"/g, '\\"')}" "$(printf '%s' "$NAUTILUS_SCRIPT_CURRENT_URI" | sed 's|^file://||')" &\nexit 0\n`, { mode: 0o755 })
        fsImpl.mkdirSync(path.dirname(dolphinMenu()), { recursive: true })
        fsImpl.writeFileSync(dolphinMenu(), `[Desktop Entry]\nType=Service\nServiceTypes=KonqPopupMenu/Plugin\nMimeType=inode/directory;\nActions=openwriterFolder\nX-KDE-Priority=TopLevel\n\n[Desktop Action openwriterFolder]\nName=${menuLabel()}\nIcon=openwriter\nExec="${exe}" %f\n`)
      } else {
        fsImpl.rmSync(nautilusScript(), { force: true })
        fsImpl.rmSync(dolphinMenu(), { force: true })
      }
    },
  }

  // ----- macOS: né l'una né l'altra si possono fare da qui. -----
  const mac = {
    markdownSupport: () => unsupported('mac-manual'),
    markdownStatus: async () => ({ registered: false, isDefault: false, canRemove: false }),
    setMarkdown: async () => { throw new Error('Not supported on this system') },
    folderSupport: () => unsupported('mac-manual'),
    folderEnabled: async () => false,
    setFolderMenu: async () => { throw new Error('Not supported on this system') },
  }

  const backend = platform === 'win32' ? windows : platform === 'linux' ? linux : platform === 'darwin' ? mac : null
  const none = { markdownSupport: () => unsupported('platform'), markdownStatus: async () => ({ registered: false, isDefault: false }), setMarkdown: async () => { throw new Error('Not supported on this system') }, folderSupport: () => unsupported('platform'), folderEnabled: async () => false, setFolderMenu: async () => { throw new Error('Not supported on this system') } }
  const system = backend || none

  return {
    // → { platform, markdown: { supported, reason?, registered, isDefault }, folder: { supported, reason?, enabled } }
    async status() {
      const markdownSupport = await system.markdownSupport()
      const folderSupport = await system.folderSupport()
      const markdown = markdownSupport.supported ? { ...markdownSupport, ...(await system.markdownStatus().catch(() => ({ registered: false, isDefault: false }))) } : { ...markdownSupport, registered: false, isDefault: false }
      const folder = folderSupport.supported ? { ...folderSupport, enabled: await system.folderEnabled().catch(() => false) } : { ...folderSupport, enabled: false }
      return { platform, markdown, folder }
    },
    async setMarkdown(on) {
      const support = await system.markdownSupport()
      if (!support.supported) throw new Error(`Not supported on this system (${support.reason})`)
      await system.setMarkdown(Boolean(on))
      return this.status()
    },
    async setFolderMenu(on) {
      const support = await system.folderSupport()
      if (!support.supported) throw new Error(`Not supported on this system (${support.reason})`)
      await system.setFolderMenu(Boolean(on))
      return this.status()
    },
  }
}

module.exports = { createSystemIntegration, EXTENSIONS, PROG_ID, MARKDOWN_MIME, DESKTOP_ID }
