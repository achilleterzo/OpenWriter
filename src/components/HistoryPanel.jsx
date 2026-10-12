import { useCallback, useEffect, useState } from 'react'
import { GitCompare, History, RotateCcw, Save, Trash2 } from 'lucide-react'
import VersionDiffDialog from './VersionDiffDialog.jsx'

const electronAPI = window.electronAPI
const formatter = new Intl.DateTimeFormat('it', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

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
    await electronAPI.addVersion(filePath, editor.getMarkdown(), label.trim() || 'Versione manuale')
    setLabel('')
    onStatus('Versione salvata')
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
    await electronAPI.addVersion(filePath, editor.getMarkdown(), 'Prima del ripristino')
    editor.commands.setContent(content ?? await electronAPI.getVersion(filePath, version.id), { contentType: 'markdown' })
    setComparison(null)
    onStatus('Versione ripristinata (non ancora salvata)')
  })

  if (!project) return <p className="px-3 py-3 text-xs text-slate-600">Apri un progetto per usare la cronologia delle versioni.</p>
  if (!filePath) return <p className="px-3 py-3 text-xs text-slate-600">Salva il documento come Markdown dentro il progetto per iniziare a storicizzarne le versioni.</p>
  if (!state.available) return <p className="px-3 py-3 text-xs text-slate-600">Questo documento è fuori dalla cartella del progetto: la cronologia non è disponibile.</p>

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex gap-2 border-b border-slate-800 p-3">
        <input
          value={label}
          maxLength={120}
          placeholder="Etichetta (facoltativa)"
          className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-accent-400"
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') saveVersion() }}
        />
        <button type="button" title="Salva una versione ora" aria-label="Salva una versione ora" className="rounded-md bg-accent-600 p-2 text-white transition hover:bg-accent-500" onClick={saveVersion}><Save size={15} /></button>
      </div>
      {error && <p className="px-3 py-2 text-xs text-rose-400">{error}</p>}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!state.versions.length && (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <History size={26} className="text-slate-600" />
            <p className="text-xs text-slate-500">Nessuna versione. Ne viene salvata una a ogni salvataggio del documento.</p>
          </div>
        )}
        {state.versions.map((version) => (
          <div key={version.id} className="group border-b border-slate-800/60 px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm text-slate-200">{version.label || (version.auto ? 'Salvataggio' : 'Versione')}</span>
              <span className="shrink-0 text-xs text-slate-500">{formatter.format(new Date(version.at))}</span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="text-xs text-slate-600">{version.size.toLocaleString('it')} caratteri</span>
              <span className="flex gap-0.5 opacity-60 transition group-hover:opacity-100">
                <button type="button" title="Confronta con il testo attuale" aria-label="Confronta" className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-50" onClick={() => openComparison(version)}><GitCompare size={14} /></button>
                <button type="button" title="Ripristina" aria-label="Ripristina" className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-50" onClick={() => restore(version)}><RotateCcw size={14} /></button>
                <button type="button" title="Elimina" aria-label="Elimina" className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-rose-400" onClick={() => run(() => electronAPI.deleteVersion(filePath, version.id))}><Trash2 size={14} /></button>
              </span>
            </div>
          </div>
        ))}
      </div>
      {comparison && (
        <VersionDiffDialog
          title={comparison.version.label || formatter.format(new Date(comparison.version.at))}
          before={comparison.before}
          after={comparison.after}
          onClose={() => setComparison(null)}
          onRestore={() => restore(comparison.version, comparison.before)}
        />
      )}
    </div>
  )
}
