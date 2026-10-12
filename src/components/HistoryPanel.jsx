import { useCallback, useEffect, useState } from 'react'
import { GitCompare, History, RotateCcw, Save, Trash2 } from 'lucide-react'
import VersionDiffDialog from './VersionDiffDialog.jsx'
import { formatDateTime, formatNumber } from '../i18n/index.js'
import { t } from '../i18n/index.js'

const electronAPI = window.electronAPI
const SHORT_DATE = { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }

export default function HistoryPanel({ tab, editor, project, historyVersion, onChanged, onStatus }) {
  const [state, setState] = useState({ available: false, versions: [] })
  const [label, setLabel] = useState('')
  const [comparison, setComparison] = useState(null)
  const [error, setError] = useState('')
  const filePath = tab.filePath

  const refresh = useCallback(async () => {
    if (!filePath || !project) { setState({ available: false, versions: [] }); return }
    try {
      setState(await electronAPI.listVersions(filePath))
      setError('')
    } catch (reason) {
      setError(reason.message)
    }
  }, [filePath, project])

  useEffect(() => { refresh() }, [refresh, historyVersion])

  async function run(action) {
    try {
      await action()
      onChanged()
    } catch (reason) {
      setError(reason.message)
    }
  }

  const saveVersion = () => run(async () => {
    await electronAPI.addVersion(filePath, editor.getMarkdown(), label.trim() || t('Manual version'))
    setLabel('')
    onStatus(t('Version saved'))
  })

  async function openComparison(version) {
    try {
      setComparison({ version, before: await electronAPI.getVersion(filePath, version.id), after: editor.getMarkdown() })
    } catch (reason) {
      setError(reason.message)
    }
  }

  const restore = (version, content) => run(async () => {
    // Lo stato attuale viene archiviato prima, così il ripristino è sempre reversibile.
    await electronAPI.addVersion(filePath, editor.getMarkdown(), t('Before the restore'))
    editor.commands.setContent(content ?? await electronAPI.getVersion(filePath, version.id), { contentType: 'markdown' })
    setComparison(null)
    onStatus(t('Version restored (not saved yet)'))
  })

  if (!project) return <p className="px-3 py-3 text-xs text-slate-500">{t('Open a project to use the version history.')}</p>
  if (!filePath) return <p className="px-3 py-3 text-xs text-slate-500">{t('Save the document as Markdown inside the project to start keeping its versions.')}</p>
  if (!state.available) return <p className="px-3 py-3 text-xs text-slate-500">{t('This document is outside the project folder: the history is not available.')}</p>

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex gap-2 border-b border-slate-800 p-3">
        <input
          value={label}
          maxLength={120}
          placeholder={t('Label (optional)')}
          className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-accent-400"
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') saveVersion() }}
        />
        <button type="button" title={t('Save a version now')} aria-label={t('Save a version now')} className="rounded-md bg-accent-600 p-2 text-white transition hover:bg-accent-500" onClick={saveVersion}><Save size={15} /></button>
      </div>
      {error && <p className="px-3 py-2 text-xs text-rose-400">{error}</p>}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!state.versions.length && (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <History size={26} className="text-slate-500" />
            <p className="text-xs text-slate-500">{t('No versions. One is saved every time the document is saved.')}</p>
          </div>
        )}
        {state.versions.map((version) => (
          <div key={version.id} className="group border-b border-slate-800/60 px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm text-slate-200">{version.label || (version.auto ? t('Automatic save') : t('Version'))}</span>
              <span className="shrink-0 text-xs text-slate-500">{formatDateTime(version.at, SHORT_DATE)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-xs text-slate-500">{t('{formatNumber} characters', { formatNumber: formatNumber(version.size) })}</span>
              <span className="flex gap-0.5 opacity-60 transition group-hover:opacity-100">
                <button type="button" title={t('Compare with the current text')} aria-label={t('Compare')} className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-50" onClick={() => openComparison(version)}><GitCompare size={14} /></button>
                <button type="button" title={t('Restore')} aria-label={t('Restore')} className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-50" onClick={() => restore(version)}><RotateCcw size={14} /></button>
                <button type="button" title={t('Delete')} aria-label={t('Delete')} className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-rose-400" onClick={() => run(() => electronAPI.deleteVersion(filePath, version.id))}><Trash2 size={14} /></button>
              </span>
            </div>
          </div>
        ))}
      </div>
      {comparison && (
        <VersionDiffDialog
          title={comparison.version.label || formatDateTime(comparison.version.at, SHORT_DATE)}
          before={comparison.before}
          after={comparison.after}
          onClose={() => setComparison(null)}
          onRestore={() => restore(comparison.version, comparison.before)}
        />
      )}
    </div>
  )
}
