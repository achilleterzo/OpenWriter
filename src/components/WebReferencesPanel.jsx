import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, FileText, Star, Trash2 } from 'lucide-react'
import { t } from '../i18n/index.js'

const electronAPI = window.electronAPI

const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } }
const dateOf = (iso) => { try { return new Date(iso).toLocaleDateString() } catch { return '' } }

// Riferimenti web del progetto: le pagine aggiunte al contesto con la stellina del browser (copia in Markdown in .ow/web, vedi web-references.cjs). Da qui si
// riapre la pagina, si apre la copia salvata o si toglie dal contesto.
export default function WebReferencesPanel({ project, version, onOpenUrl, onOpenFile, onChanged, onStatus }) {
  const [pages, setPages] = useState(null)

  const load = useCallback(() => {
    if (!project) { setPages([]); return }
    electronAPI.webRefs.list().then(setPages).catch(() => setPages([]))
  }, [project])

  useEffect(() => { load() }, [load, version])

  async function remove(entry) {
    try {
      setPages(await electronAPI.webRefs.remove(entry.id))
      onStatus?.(t('Removed from the context'))
      onChanged?.()
    } catch (error) {
      onStatus?.(error.message)
    }
  }

  const iconButton = 'rounded p-1.5 text-slate-500 transition hover:bg-slate-700 hover:text-slate-50'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-slate-800 px-3 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100"><Star size={14} className="fill-amber-400 text-amber-400" /> {t('Web references')}</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">{t('Pages added with the star in the browser. The assistant can read their saved copy.')}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {pages && !pages.length && <p className="px-3 py-3 text-xs text-slate-500">{t('No saved pages. Use the star in the browser.')}</p>}
        {(pages || []).map((entry) => (
          <div key={entry.id} className="group flex items-start gap-1 px-2 py-1.5 hover:bg-slate-800/60">
            <button type="button" title={`${entry.url}\n${t('Saved')}: ${dateOf(entry.savedAt)} · ${t('Last checked')}: ${dateOf(entry.checkedAt)}`} className="min-w-0 flex-1 px-1 text-left" onClick={() => onOpenUrl(entry.url)}>
              <span className="block truncate text-sm text-slate-200">{entry.title}</span>
              <span className="block truncate text-xs text-slate-500">{hostOf(entry.url)} · {dateOf(entry.checkedAt || entry.savedAt)}{entry.source === 'assistant' ? ` · ${t('saved by the assistant')}` : entry.source === 'agent' ? ` · ${t('saved by an agent')}` : ''}{entry.exists ? '' : ` · ${t('Copy missing')}`}</span>
            </button>
            <button type="button" aria-label={t('Open the page')} title={t('Open the page')} className={iconButton} onClick={() => onOpenUrl(entry.url)}><ExternalLink size={14} /></button>
            <button type="button" aria-label={t('Open the saved copy')} title={t('Open the saved copy')} disabled={!entry.exists} className={`${iconButton} disabled:opacity-30`} onClick={() => onOpenFile(entry.path)}><FileText size={14} /></button>
            <button type="button" aria-label={t('Remove from the context')} title={t('Remove from the context')} className={iconButton} onClick={() => remove(entry)}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}
