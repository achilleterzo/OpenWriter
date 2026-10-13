import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import appIcon from '../../assets/icon.png'
import { t } from '../i18n/index.js'

const electronAPI = window.electronAPI
const REPOSITORY_URL = 'https://github.com/achilleterzo/OpenWriter'

/** Informazioni sull'app, con il controllo manuale della nuova versione. */
export default function AboutDialog({ version, release, onCheck, onClose, checkOnOpen = false }) {
  const [status, setStatus] = useState('') // '', 'checking', 'current', 'error'

  async function check() {
    setStatus('checking')
    try {
      const found = await onCheck()
      setStatus(found ? '' : 'current')
    } catch {
      setStatus('error')
    }
  }

  useEffect(() => { if (checkOnOpen) check() }, [])

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={t('About OpenWriter')} className="relative grid w-full max-w-sm justify-items-center gap-1 rounded-xl border border-slate-700 bg-slate-900 p-6 text-center shadow-xl">
        <button type="button" aria-label={t('Close')} title={t('Close (Esc)')} className="absolute right-3 top-3 rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-50" onClick={onClose}><X size={16} /></button>
        <img src={appIcon} alt="" className="mb-2 h-16 w-16" />
        <h2 className="text-xl font-semibold text-slate-50">OpenWriter</h2>
        <p className="font-mono text-xs text-slate-400">{t('Version {version}', { version: version || '—' })}</p>
        <p className="mt-2 text-sm text-slate-400">{t('A local-first Markdown editor with an AI writing assistant.')}</p>

        <div className="mt-3 grid w-full gap-2">
          {release ? (
            <div className="rounded-lg border border-accent-500/40 bg-accent-500/10 p-3 text-sm text-slate-200">
              <p>{t('Update available: v{version}', { version: release.version })}</p>
              <button type="button" className="mt-2 rounded-md bg-accent-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-500" onClick={() => electronAPI.openRelease(release.url)}>{t('Download latest build')}</button>
            </div>
          ) : (
            <button type="button" disabled={status === 'checking'} className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-slate-600 disabled:opacity-60" onClick={check}>{status === 'checking' ? t('Checking…') : t('Check for updates')}</button>
          )}
          {status === 'current' && <p className="text-xs text-emerald-400">{t('You are up to date.')}</p>}
          {status === 'error' && <p className="text-xs text-rose-400">{t('Could not check for updates')}</p>}
          <button type="button" className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:border-accent-400 hover:text-slate-50" onClick={() => electronAPI.openRelease(REPOSITORY_URL)}>{t('Open the project on GitHub')} ↗</button>
        </div>

        <div className="mt-4 w-full border-t border-slate-800 pt-3 text-xs">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('Developer')}</span>
          <strong className="font-medium text-slate-200">Carlo Achilleterzo Cancelloni</strong>
        </div>
      </div>
    </div>
  )
}
