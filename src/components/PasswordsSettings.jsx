import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Trash2 } from 'lucide-react'
import { useDialogs } from './Dialogs.jsx'
import { t } from '../i18n/index.js'

const electronAPI = window.electronAPI
const smallButton = 'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800 hover:text-slate-50 disabled:opacity-50'

/**
 * Le password che il browser interno ha salvato (siti e utenti: le password non si mostrano), e i siti per cui si è scelto «Mai».
 * Sono cifrate su questo computer e valgono per tutti i progetti.
 */
export default function PasswordsSettings() {
  const dialogs = useDialogs()
  const [data, setData] = useState({ entries: [], never: [] })
  const [available, setAvailable] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [status, list] = await Promise.all([electronAPI.browserPasswords.status(), electronAPI.browserPasswords.list()])
      setAvailable(status.available)
      setData(list)
    } catch (reason) { setError(reason.message) }
  }, [])
  useEffect(() => { load() }, [load])

  const run = async (action) => {
    try { setError(''); await action(); await load() } catch (reason) { setError(reason.message) }
  }
  const clearAll = async () => {
    if (await dialogs.confirm(t('Delete all the saved passwords? This cannot be undone.'), { danger: true, confirmLabel: t('Delete') })) run(() => electronAPI.browserPasswords.clear())
  }
  const site = (origin) => origin.replace(/^https?:\/\//, '')

  return (
    <section className="grid grid-cols-1 gap-4 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
      <p className="max-w-2xl text-sm leading-6 text-slate-400">{t('The browser asks whether to save the password when you sign in to a site, and fills it in on request (key button in the address bar). Passwords are stored encrypted on this computer, never in the projects, and the assistant never sees them.')}</p>
      {!available && <p className="text-sm text-amber-300">{t('Encryption is not available on this computer: passwords cannot be saved.')}</p>}
      {error && <p className="text-sm text-rose-400">{error}</p>}
      {data.entries.length ? (
        <ul className="grid gap-1">
          {data.entries.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-sm">
              <KeyRound size={14} className="shrink-0 text-slate-500" />
              <span className="min-w-0 flex-1 truncate text-slate-100">{site(entry.origin)}</span>
              <span className="min-w-0 max-w-[40%] truncate text-slate-400">{entry.username || t('(no username)')}</span>
              <button type="button" aria-label={t('Delete')} title={t('Delete')} className={smallButton} onClick={() => run(() => electronAPI.browserPasswords.remove(entry.id))}><Trash2 size={13} /></button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-slate-500">{t('No saved passwords.')}</p>}
      {data.entries.length > 0 && <div><button type="button" className={`${smallButton} text-rose-300`} onClick={clearAll}><Trash2 size={13} /> {t('Delete all')}</button></div>}
      {data.never.length > 0 && (
        <div className="grid gap-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t('Never save for these sites')}</h3>
          {data.never.map((origin) => (
            <div key={origin} className="flex items-center gap-2 text-sm text-slate-300">
              <span className="min-w-0 flex-1 truncate">{site(origin)}</span>
              <button type="button" className={smallButton} onClick={() => run(() => electronAPI.browserPasswords.removeNever(origin))}>{t('Ask again')}</button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
