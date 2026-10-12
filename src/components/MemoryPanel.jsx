import { useCallback, useEffect, useState } from 'react'
import { Bot, Check, Link2, Pencil, Trash2, User, X } from 'lucide-react'
import { formatDateTime, t } from '../i18n/index.js'

const electronAPI = window.electronAPI

const fieldClass = 'w-full resize-y rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-accent-400'
const smallButton = 'flex items-center gap-1 rounded px-2 py-1 text-xs transition'
const baseName = (path) => path.split('/').filter(Boolean).at(-1) || path

/** Memoria del progetto: informazioni importanti salvate dall'assistente o dall'utente, ognuna con i file a cui si applica. */
export default function MemoryPanel({ project, memoryVersion, activePath, onOpenFile, onStatus }) {
  const [entries, setEntries] = useState([])
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(null) // { id, text }
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!project) { setEntries([]); return }
    try { setEntries((await electronAPI.listMemory()).slice().reverse()) } catch (reason) { setError(reason.message) }
  }, [project])

  useEffect(() => { refresh() }, [refresh, memoryVersion])

  async function run(action) {
    setError('')
    try { await action(); await refresh() } catch (reason) { setError(reason.message); onStatus?.(reason.message) }
  }

  const add = () => run(async () => {
    if (!draft.trim()) return
    await electronAPI.addMemory({ text: draft, files: activePath ? [activePath] : [], author: 'user' })
    setDraft('')
  })

  const save = (entry) => run(async () => {
    await electronAPI.updateMemory(entry.id, { text: editing.text })
    setEditing(null)
  })

  const setFiles = (entry, files) => run(() => electronAPI.updateMemory(entry.id, { files }))

  if (!project) return <p className="px-3 py-3 text-xs text-slate-500">{t('Open a project to use the memory.')}</p>

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-1.5 border-b border-slate-800 px-3 pb-3">
        <textarea
          rows={3}
          value={draft}
          placeholder={t('Write something worth remembering…')}
          className={fieldClass}
          aria-label={t('Project memory')}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-xs text-slate-500" title={activePath || ''}>{activePath ? `🔗 ${baseName(activePath)}` : ''}</span>
          <button type="button" disabled={!draft.trim()} className={`${smallButton} bg-accent-600 text-white hover:bg-accent-500 disabled:opacity-50`} onClick={add}>{t('Add')}</button>
        </div>
      </div>

      {error && <p className="px-3 py-2 text-xs text-rose-400">{error}</p>}

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {entries.map((entry) => (
          <li key={entry.id} className="border-b border-slate-800/60 px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-xs text-slate-500" title={entry.author === 'ai' ? t('Written by the assistant') : t('Written by you')}>
              {entry.author === 'ai' ? <Bot size={12} /> : <User size={12} />}
              {formatDateTime(entry.updatedAt, { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
            {entry.title && <span className="mt-1 block text-sm font-semibold text-slate-100">{entry.title}</span>}
            {editing?.id === entry.id ? (
              <div className="mt-1 grid gap-1.5">
                <textarea autoFocus rows={4} value={editing.text} className={fieldClass} onChange={(event) => setEditing({ id: entry.id, text: event.target.value })} onKeyDown={(event) => { if (event.key === 'Escape') setEditing(null) }} />
                <div className="flex gap-1">
                  <button type="button" disabled={!editing.text.trim()} className={`${smallButton} bg-accent-600 text-white hover:bg-accent-500 disabled:opacity-50`} onClick={() => save(entry)}><Check size={12} /> {t('Save')}</button>
                  <button type="button" className={`${smallButton} text-slate-400 hover:bg-slate-800 hover:text-slate-50`} onClick={() => setEditing(null)}>{t('Cancel')}</button>
                </div>
              </div>
            ) : (
              <span className="mt-1 block whitespace-pre-wrap text-sm text-slate-200">{entry.text}</span>
            )}
            {entry.files?.length > 0 && (
              <span className="mt-1.5 flex flex-wrap gap-1">
                {entry.files.map((file) => (
                  <span key={file} className="flex max-w-full items-center gap-1 rounded-full border border-slate-700 py-0.5 pl-2 pr-1 text-xs text-slate-300" title={file}>
                    <button type="button" className="truncate hover:text-slate-50" onClick={() => onOpenFile(file)}>{baseName(file)}</button>
                    <button type="button" aria-label={t('Unlink {file}', { file: baseName(file) })} title={t('Unlink {file}', { file: baseName(file) })} className="rounded-full p-0.5 text-slate-500 hover:bg-slate-700 hover:text-slate-50" onClick={() => setFiles(entry, entry.files.filter((item) => item !== file))}><X size={10} /></button>
                  </span>
                ))}
              </span>
            )}
            <div className="mt-1.5 flex flex-wrap gap-1">
              <button type="button" aria-label={t('Edit')} title={t('Edit')} className={`${smallButton} text-slate-400 hover:bg-slate-800 hover:text-slate-50`} onClick={() => setEditing({ id: entry.id, text: entry.text })}><Pencil size={12} /></button>
              {activePath && !entry.files?.includes(activePath) && (
                <button type="button" className={`${smallButton} text-slate-400 hover:bg-slate-800 hover:text-slate-50`} title={t('Link the active document')} onClick={() => setFiles(entry, [...(entry.files || []), activePath])}><Link2 size={12} /> {baseName(activePath)}</button>
              )}
              <button type="button" aria-label={t('Delete from memory')} title={t('Delete from memory')} className={`${smallButton} ml-auto text-slate-500 hover:bg-slate-800 hover:text-rose-400`} onClick={() => run(() => electronAPI.deleteMemory(entry.id))}><Trash2 size={12} /></button>
            </div>
          </li>
        ))}
        {!entries.length && <li className="px-3 py-2 text-xs text-slate-500">{t('No memories yet. The assistant saves important information here, or you can add it yourself.')}</li>}
      </ul>
    </div>
  )
}
