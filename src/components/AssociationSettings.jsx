import { useEffect, useState } from 'react'
import { FileSymlink, FolderOpen } from 'lucide-react'
import { t } from '../i18n/index.js'

const electronAPI = window.electronAPI

// Perché una cosa non è disponibile su questa piattaforma (i codici vengono da electron/system-integration.cjs).
const reasonText = (reason) => ({
  development: t('Not available in the development version: install the app to use this.'),
  'mac-manual': t('Not available on macOS from inside the app.'),
  'no-desktop-file': t('The launcher file of OpenWriter was not found: install the app from its package to use this.'),
  'no-xdg-mime': t('The xdg-mime tool is not installed.'),
}[reason] || t('Not available on this system.'))

const buttonClass = 'rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-slate-600 disabled:opacity-50'

// Associazioni con il sistema operativo: i file Markdown aperti con OpenWriter e la voce «Apri come progetto OpenWriter» nel file manager. Ogni piattaforma ha il suo modo
// (system-integration.cjs): dove non c'è un modo affidabile la sezione lo dice e spiega cosa fare a mano.
export default function AssociationSettings() {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    electronAPI.getIntegrationStatus().then((value) => { if (!cancelled) setStatus(value) }).catch((reason) => { if (!cancelled) setError(reason.message) })
    return () => { cancelled = true }
  }, [])

  async function change(action) {
    setBusy(true)
    setError('')
    try { setStatus(await action()) } catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }

  const markdown = status?.markdown
  const folder = status?.folder
  const platform = status?.platform
  const folderLabel = platform === 'win32'
    ? t('Add “Open as OpenWriter project” to the folder menu of File Explorer')
    : t('Add “Open as OpenWriter project” to the folder menu of the file manager (Nautilus, Dolphin)')

  let markdownLine = ''
  if (markdown?.supported) {
    markdownLine = markdown.isDefault ? t('OpenWriter is the default app for Markdown files.')
      : markdown.registered ? t('OpenWriter is offered in “Open with”. Choose it as the default app in the system settings.')
        : t('Not associated.')
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <p className="max-w-xl text-sm leading-6 text-slate-400">{t('Connect OpenWriter with your operating system.')}</p>
      {error && <span className="text-xs text-rose-400">{error}</span>}

      <section className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
        <div className="flex items-center gap-2">
          <FileSymlink className="text-accent-400" size={20} />
          <h2 className="text-lg font-semibold">{t('Markdown files')}</h2>
        </div>
        <p className="max-w-xl text-sm leading-6 text-slate-400">{t('Open .md, .markdown and .mdown files with OpenWriter by double-clicking them.')}</p>
        {!status && !error && <span className="text-xs text-slate-500">{t('Checking…')}</span>}
        {markdown && !markdown.supported && (
          <>
            <span className="max-w-xl text-xs text-amber-400">{reasonText(markdown.reason)}</span>
            {markdown.reason === 'mac-manual' && <p className="max-w-xl text-xs leading-5 text-slate-500">{t('To make it the default app: select a Markdown file in the Finder, choose File → Get Info, pick OpenWriter under “Open with” and click “Change All…”.')}</p>}
          </>
        )}
        {markdown?.supported && (
          <>
            <span className="text-xs text-slate-400">{markdownLine}</span>
            <div className="flex flex-wrap items-center gap-3">
              {!(markdown.registered && (markdown.isDefault || platform === 'win32')) && (
                <button type="button" disabled={busy} className={buttonClass} onClick={() => change(() => electronAPI.setMarkdownAssociation(true))}>{platform === 'linux' ? t('Make OpenWriter the default app') : t('Associate Markdown files')}</button>
              )}
              {markdown.registered && !markdown.isDefault && platform === 'win32' && (
                <button type="button" disabled={busy} className={buttonClass} onClick={() => electronAPI.openDefaultApps().catch((reason) => setError(reason.message))}>{t('Open the default apps settings')}</button>
              )}
              {markdown.registered && markdown.canRemove && (
                <button type="button" disabled={busy} className={buttonClass} onClick={() => change(() => electronAPI.setMarkdownAssociation(false))}>{t('Remove the association')}</button>
              )}
            </div>
            {platform === 'win32' && !markdown.isDefault && <p className="max-w-xl text-xs leading-5 text-slate-500">{t('Windows does not let an app make itself the default: after associating, choose OpenWriter for .md in the default apps settings.')}</p>}
          </>
        )}
      </section>

      <section className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
        <div className="flex items-center gap-2">
          <FolderOpen className="text-accent-400" size={20} />
          <h2 className="text-lg font-semibold">{t('Folders')}</h2>
        </div>
        <p className="max-w-xl text-sm leading-6 text-slate-400">{t('Right-click a folder and open it as an OpenWriter project directly.')}</p>
        {folder && !folder.supported && <span className="max-w-xl text-xs text-amber-400">{folder.reason === 'mac-manual' ? t('Not available on macOS: the system does not let an app add an entry to the Finder menu.') : reasonText(folder.reason)}</span>}
        {folder?.supported && (
          <label className="flex items-start gap-3 text-sm text-slate-300">
            <input type="checkbox" disabled={busy} checked={folder.enabled} className="mt-1 accent-accent-500" onChange={(event) => change(() => electronAPI.setFolderMenu(event.target.checked))} />
            <span>{folderLabel}</span>
          </label>
        )}
      </section>
    </div>
  )
}
