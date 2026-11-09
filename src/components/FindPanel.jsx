import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, X } from 'lucide-react'
import { t } from '../i18n/index.js'

const optionButton = (active) => `flex h-7 min-w-7 items-center justify-center rounded px-1 font-mono text-xs transition ${active ? 'bg-accent-500/30 text-accent-300 ring-1 ring-accent-400' : 'text-slate-400 hover:bg-slate-700 hover:text-slate-50'}`
const iconButton = 'flex h-7 w-7 items-center justify-center rounded text-slate-400 transition hover:bg-slate-700 hover:text-slate-50 disabled:opacity-40 disabled:hover:bg-transparent'
const inputClass = 'min-w-0 flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-accent-400'

/**
 * L'aspetto della barra Trova / Sostituisci, senza sapere dove si cerca: la usano `FindBar` (editor dei documenti) e `TextFindBar` (lettore testuale).
 * Lo stato e la ricerca stanno nel chiamante: qui solo i campi, le opzioni (maiuscole, parola intera, espressione regolare) e i pulsanti.
 */
export default function FindPanel({
  query, onQuery, replacement, onReplacement, options, onToggle, status, error, count,
  replaceMode, onReplaceMode, onFindKeyDown, onReplaceKeyDown, onPrevious, onNext, onReplace, onReplaceAll, onClose, findRef, replaceRef,
}) {
  return (
    <div role="search" aria-label={t('Find and replace')} className="absolute right-6 top-2 z-10 grid w-[min(28rem,calc(100%-3rem))] gap-1.5 rounded-lg border border-slate-700 bg-slate-900 p-2 shadow-xl">
      <div className="flex items-center gap-1">
        <button type="button" aria-label={replaceMode ? t('Hide replace') : t('Show replace')} aria-expanded={replaceMode} className={iconButton} onClick={() => onReplaceMode(!replaceMode)}>
          {replaceMode ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <input ref={findRef} value={query} aria-label={t('Find')} placeholder={t('Find')} className={`${inputClass} ${error && query ? 'border-rose-500' : ''}`} onChange={(event) => onQuery(event.target.value)} onKeyDown={onFindKeyDown} />
        <button type="button" title={t('Match case')} aria-label={t('Match case')} aria-pressed={options.caseSensitive} className={optionButton(options.caseSensitive)} onClick={() => onToggle('caseSensitive')}>Aa</button>
        <button type="button" title={t('Whole word')} aria-label={t('Whole word')} aria-pressed={options.wholeWord} className={optionButton(options.wholeWord)} onClick={() => onToggle('wholeWord')}>ab</button>
        <button type="button" title={t('Regular expression')} aria-label={t('Regular expression')} aria-pressed={options.regex} className={optionButton(options.regex)} onClick={() => onToggle('regex')}>.*</button>
      </div>
      <div className="flex items-center gap-1 pl-8">
        <span className={`min-w-0 flex-1 truncate text-xs ${error && query ? 'text-rose-400' : 'text-slate-500'}`} title={error || ''}>{status}</span>
        <button type="button" title={t('Previous (Shift+Enter)')} aria-label={t('Previous match')} disabled={!count} className={iconButton} onClick={onPrevious}><ArrowUp size={15} /></button>
        <button type="button" title={t('Next (Enter)')} aria-label={t('Next match')} disabled={!count} className={iconButton} onClick={onNext}><ArrowDown size={15} /></button>
        <button type="button" title={t('Close (Esc)')} aria-label={t('Close search')} className={iconButton} onClick={onClose}><X size={15} /></button>
      </div>
      {replaceMode && (
        <div className="flex items-center gap-1 pl-8">
          <input ref={replaceRef} value={replacement} aria-label={t('Replace with')} placeholder={t('Replace with')} className={inputClass} onChange={(event) => onReplacement(event.target.value)} onKeyDown={onReplaceKeyDown} />
          <button type="button" disabled={!count} className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-100 transition hover:bg-slate-600 disabled:opacity-40" onClick={onReplace}>{t('Replace')}</button>
          <button type="button" disabled={!count} className="rounded bg-accent-600 px-2 py-1 text-xs text-white transition hover:bg-accent-500 disabled:opacity-40" onClick={onReplaceAll}>{t('All')}</button>
        </div>
      )}
    </div>
  )
}
