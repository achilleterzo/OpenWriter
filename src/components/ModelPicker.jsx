import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, FileText, Image as ImageIcon, Loader2, Search } from 'lucide-react'
import { t } from '../i18n/index.js'

// Cosa accettano i modelli di ogni provider ({ [id]: { vision, pdf } }), letto una volta per sessione.
const inputsCache = new Map()

const FILTERS = [
  { value: 'all', label: () => t('All'), match: () => true },
  { value: 'text', label: () => t('Text only'), match: (inputs) => inputs && !inputs.vision && !inputs.pdf },
  { value: 'image', label: () => t('Images'), match: (inputs) => Boolean(inputs?.vision) },
  { value: 'pdf', label: () => t('PDF'), match: (inputs) => Boolean(inputs?.pdf) },
]

/**
 * Selettore del modello con ricerca per nome e filtro per tipo di input (solo testo, immagini, PDF).
 * `models`: id disponibili; `loadInputs()`: Promise di { [id]: { vision, pdf } }, chiamata alla prima apertura e tenuta
 * in cache per `cacheKey`; `emptyLabel`: voce per "nessun modello" (valore ''); `placement`: 'bottom' | 'top'.
 */
export default function ModelPicker({ value, models, onChange, disabled = false, emptyLabel, loadInputs, cacheKey, placement = 'bottom', compact = false }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [inputs, setInputs] = useState(() => (inputsCache.get(cacheKey)?.value) || null)
  const [inputsState, setInputsState] = useState(inputs ? 'ready' : 'idle')
  const [active, setActive] = useState(0)
  const root = useRef(null)
  const search = useRef(null)
  const list = useRef(null)

  // Le capacità si chiedono solo quando serve (alla prima apertura): per Ollama è una richiesta per modello.
  useEffect(() => {
    if (!open || !loadInputs || !cacheKey) return undefined
    const cached = inputsCache.get(cacheKey)
    if (cached?.value) { setInputs(cached.value); setInputsState('ready'); return undefined }
    let cancelled = false
    setInputsState('loading')
    const promise = cached?.promise || loadInputs()
    inputsCache.set(cacheKey, { promise })
    promise
      .then((value) => {
        inputsCache.set(cacheKey, { value: value || {} })
        if (!cancelled) { setInputs(value || {}); setInputsState('ready') }
      })
      .catch(() => {
        inputsCache.delete(cacheKey)
        if (!cancelled) setInputsState('failed')
      })
    return () => { cancelled = true }
  }, [open, cacheKey, loadInputs])

  useEffect(() => {
    if (!open) return undefined
    search.current?.focus()
    const onDown = (event) => { if (!root.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const options = useMemo(() => [...new Set([value, ...models].filter(Boolean))], [value, models])
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((item) => [item.value, options.filter((id) => item.match(inputs?.[id])).length])), [options, inputs])
  const shown = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const rule = FILTERS.find((item) => item.value === filter) || FILTERS[0]
    return options.filter((id) => rule.match(inputs?.[id]) && words.every((word) => id.toLowerCase().includes(word)))
  }, [options, inputs, filter, query])
  // La voce "nessun modello" resta in cima solo senza ricerca né filtro.
  const entries = useMemo(() => (emptyLabel && !query.trim() && filter === 'all' ? ['', ...shown] : shown), [emptyLabel, query, filter, shown])

  useEffect(() => { setActive(Math.max(0, entries.indexOf(value || ''))) }, [entries, value])
  useEffect(() => { list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' }) }, [active, open])

  function choose(id) {
    setOpen(false)
    setQuery('')
    if (id !== (value || '')) onChange(id)
  }

  function onKeyDown(event) {
    const handled = {
      ArrowDown: () => setActive((index) => Math.min(entries.length - 1, index + 1)),
      ArrowUp: () => setActive((index) => Math.max(0, index - 1)),
      Enter: () => { if (entries[active] !== undefined) choose(entries[active]) },
      Escape: () => setOpen(false),
    }[event.key]
    if (!handled) return
    event.preventDefault()
    event.stopPropagation()
    handled()
  }

  const filtersReady = inputsState === 'ready'
  const button = compact
    ? 'flex w-full min-w-0 items-center gap-1 rounded border border-slate-700 bg-slate-800 px-1.5 py-1 text-left text-xs text-slate-100 outline-none focus:border-accent-400 disabled:opacity-50'
    : 'mt-2 flex w-full min-w-0 items-center gap-2 rounded-md border border-slate-700 bg-slate-800 px-3 py-2.5 text-left text-slate-100 outline-none focus:border-accent-400 disabled:opacity-60'

  return (
    <div ref={root} className="relative min-w-0">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label={t('Model')} title={value || ''} disabled={disabled} className={button} onClick={() => setOpen((current) => !current)}>
        <span className={`min-w-0 flex-1 truncate ${value ? '' : 'text-slate-400'}`}>{value || emptyLabel || t('Select a model')}</span>
        <ChevronDown size={compact ? 12 : 14} className="shrink-0 text-slate-500" />
      </button>
      {open && (
        <div className={`absolute left-0 z-50 grid w-80 max-w-[calc(100vw-2rem)] gap-2 rounded-lg border border-slate-700 bg-slate-900 p-2 text-sm shadow-xl ${placement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1'}`} onKeyDown={onKeyDown}>
          <label className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 focus-within:border-accent-400">
            <Search size={13} className="shrink-0 text-slate-500" />
            <input ref={search} value={query} placeholder={t('Search models…')} aria-label={t('Search models')} className="min-w-0 flex-1 bg-transparent text-xs text-slate-100 outline-none placeholder:text-slate-500" onChange={(event) => setQuery(event.target.value)} />
          </label>
          {loadInputs && inputsState !== 'failed' && (
            <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label={t('Accepted input')}>
              {FILTERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="radio"
                  aria-checked={filter === item.value}
                  disabled={item.value !== 'all' && !filtersReady}
                  className={`rounded-full border px-2 py-0.5 text-[11px] transition disabled:opacity-40 ${filter === item.value ? 'border-accent-400 bg-accent-500/15 text-slate-50' : 'border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200'}`}
                  onClick={() => setFilter(item.value)}
                >
                  {item.label()}{filtersReady && <span className="ml-1 text-slate-500">{counts[item.value]}</span>}
                </button>
              ))}
              {inputsState === 'loading' && <Loader2 size={12} className="animate-spin text-slate-500" aria-label={t('Checking what each model accepts…')} />}
            </div>
          )}
          {inputsState === 'failed' && <p className="text-[11px] text-slate-500">{t('Could not check what each model accepts.')}</p>}
          <ul ref={list} role="listbox" aria-label={t('Models')} className="max-h-72 overflow-y-auto">
            {entries.map((id, index) => {
              const accepts = inputs?.[id]
              return (
                <li
                  key={id || '__empty'}
                  data-index={index}
                  role="option"
                  aria-selected={id === (value || '')}
                  className={`flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs ${index === active ? 'bg-slate-800 text-slate-50' : 'text-slate-300'}`}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(id)}
                >
                  <Check size={12} className={`shrink-0 ${id === (value || '') ? 'text-accent-400' : 'invisible'}`} />
                  <span className={`min-w-0 flex-1 truncate ${id ? '' : 'text-slate-400'}`} title={id || undefined}>{id || emptyLabel}</span>
                  {accepts?.vision && <ImageIcon size={12} className="shrink-0 text-slate-500" aria-label={t('Reads images')}><title>{t('Reads images')}</title></ImageIcon>}
                  {accepts?.pdf && <FileText size={12} className="shrink-0 text-slate-500" aria-label={t('Reads PDF files')}><title>{t('Reads PDF files')}</title></FileText>}
                </li>
              )
            })}
            {entries.length === 0 && <li className="px-2 py-2 text-xs text-slate-500">{t('No models match')}</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
