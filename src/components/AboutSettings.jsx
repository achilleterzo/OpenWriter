import { useState } from 'react'
import appIcon from '../../assets/icon.png'
import { t } from '../i18n/index.js'

const electronAPI = window.electronAPI
const REPOSITORY_URL = 'https://github.com/achilleterzo/OpenWriter'

/** Versione dell'app e controllo manuale degli aggiornamenti (la stessa logica della finestra "Informazioni"). */
export default function AboutSettings({ version, release, onCheck }) {
  const [status, setStatus] = useState('') // '', 'checking', 'current', 'error'

  async function check() {
    setStatus('checking')
    try {
      setStatus((await onCheck()) ? '' : 'current')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="flex min-h-full flex-col gap-6">
      <section className="grid gap-4 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
        <div className="flex items-center gap-4">
          <img src={appIcon} alt="" className="h-14 w-14" />
          <div>
            <h2 className="text-lg font-semibold">OpenWriter</h2>
            <p className="font-mono text-xs text-slate-400">{t('Version {version}', { version: version || '—' })}</p>
          </div>
        </div>
        <p className="max-w-xl text-sm leading-6 text-slate-400">{t('A local-first Markdown editor with an AI writing assistant.')}</p>
      </section>

      <section className="grid gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
        <h2 className="text-lg font-semibold">{t('Updates')}</h2>
        {release ? (
          <div className="grid justify-items-start gap-2 rounded-lg border border-accent-500/40 bg-accent-500/10 p-3 text-sm text-slate-200">
            <p>{t('Update available: v{version}', { version: release.version })}</p>
            <button type="button" className="rounded-md bg-accent-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-500" onClick={() => electronAPI.openRelease(release.url)}>{t('Download latest build')}</button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={status === 'checking'} className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-600 disabled:opacity-60" onClick={check}>{status === 'checking' ? t('Checking…') : t('Check for updates')}</button>
            {status === 'current' && <p className="text-sm text-emerald-400">{t('You are up to date.')}</p>}
            {status === 'error' && <p className="text-sm text-rose-400">{t('Could not check for updates')}</p>}
          </div>
        )}
        <div>
          <button type="button" className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:border-accent-400 hover:text-slate-50" onClick={() => electronAPI.openRelease(REPOSITORY_URL)}>{t('Open the project on GitHub')} ↗</button>
        </div>
      </section>

      <div className="mt-auto grid gap-1 text-right text-xs text-slate-500">
        <p>{t('Developer')}: <strong className="font-medium text-slate-300">Carlo Achilleterzo Cancelloni</strong></p>
        <p>{t('License')}: <strong className="font-medium text-slate-300">MIT</strong></p>
      </div>
    </div>
  )
}
