import { useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { collapseDiff, lineDiff } from '../lib/lineDiff.js'

const rowStyle = {
  add: 'bg-emerald-500/15 text-emerald-300',
  del: 'bg-rose-500/15 text-rose-300',
  same: 'text-slate-400',
  gap: 'bg-slate-800/60 text-center text-slate-500',
}
const marker = { add: '+', del: '−', same: ' ', gap: '' }

export default function VersionDiffDialog({ title, before, after, onClose, onRestore }) {
  const lines = useMemo(() => collapseDiff(lineDiff(before, after)), [before, after])
  const changed = lines.some((line) => line.type === 'add' || line.type === 'del')

  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm sm:p-8" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section role="dialog" aria-modal="true" aria-label="Confronto versioni" className="flex h-[min(720px,calc(100vh-2rem))] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 text-slate-100 shadow-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-slate-800 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{title}</h2>
            <p className="text-xs text-slate-500"><span className="text-rose-300">− versione salvata</span> · <span className="text-emerald-300">+ testo attuale</span></p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button type="button" className="rounded-md bg-accent-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-accent-500" onClick={onRestore}>Ripristina questa versione</button>
            <button type="button" aria-label="Chiudi" className="rounded p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-50" onClick={onClose}><X size={18} /></button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-950/40 py-2 font-mono text-xs leading-5">
          {!changed && <p className="px-5 py-3 text-sm text-slate-400">Nessuna differenza: il testo attuale coincide con questa versione.</p>}
          {changed && lines.map((line, index) => (
            <div key={index} className={`flex whitespace-pre-wrap break-words px-3 ${rowStyle[line.type]}`}>
              <span className="w-5 shrink-0 select-none">{marker[line.type]}</span>
              <span className="min-w-0 flex-1">{line.text || ' '}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
