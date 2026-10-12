import { useEffect, useRef, useState } from 'react'
import { useEditorState } from '@tiptap/react'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, X } from 'lucide-react'
import { getSearchState, goToMatch, replaceAll, replaceCurrent, setSearch } from '../lib/searchExtension.js'

const optionButton = (active) => `flex h-7 min-w-7 items-center justify-center rounded px-1 font-mono text-xs transition ${active ? 'bg-accent-500/30 text-accent-300 ring-1 ring-accent-400' : 'text-slate-400 hover:bg-slate-700 hover:text-slate-50'}`
const iconButton = 'flex h-7 w-7 items-center justify-center rounded text-slate-400 transition hover:bg-slate-700 hover:text-slate-50 disabled:opacity-40 disabled:hover:bg-transparent'
const inputClass = 'min-w-0 flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-accent-400'

// Barra Trova / Sostituisci in sovraimpressione sul documento.
export default function FindBar({ editor, replaceMode, onReplaceMode, focusToken, onClose }) {
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [options, setOptions] = useState({ caseSensitive: false, wholeWord: false, regex: false })
  const findInput = useRef(null)
  const replaceInput = useRef(null)

  const { count, current, error } = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      const state = getSearchState(ed)
      return { count: state.matches.length, current: state.current, error: state.error }
    },
  })

  // Aprendo la barra si parte dal testo selezionato (se è su una riga) e si porta il cursore sul campo.
  useEffect(() => {
    const { from, to, empty } = editor.state.selection
    if (!empty) {
      const selected = editor.state.doc.textBetween(from, to, '\n')
      if (selected && !selected.includes('\n')) setQuery(selected)
    }
    findInput.current?.focus()
    findInput.current?.select()
  }, [editor, focusToken])

  useEffect(() => {
    if (replaceMode) replaceInput.current?.focus()
  }, [replaceMode, focusToken])

  useEffect(() => {
    setSearch(editor, { query, ...options })
  }, [editor, query, options])

  // Alla chiusura le evidenziazioni spariscono.
  useEffect(() => () => setSearch(editor, { query: '' }), [editor])

  const toggle = (key) => setOptions((value) => ({ ...value, [key]: !value[key] }))
  const status = !query ? '' : error ? 'Espressione non valida' : count ? `${current + 1} di ${count}` : 'Nessun risultato'

  function onFindKeyDown(event) {
    if (event.key === 'Enter') { event.preventDefault(); goToMatch(editor, event.shiftKey ? -1 : 1) }
    if (event.key === 'Escape') { event.preventDefault(); onClose() }
  }

  function onReplaceKeyDown(event) {
    if (event.key === 'Enter') { event.preventDefault(); if (replaceCurrent(editor, replacement)) goToMatch(editor, 0) }
    if (event.key === 'Escape') { event.preventDefault(); onClose() }
  }

  return (
    <div role="search" aria-label="Trova e sostituisci" className="absolute right-6 top-2 z-10 grid w-[min(28rem,calc(100%-3rem))] gap-1.5 rounded-lg border border-slate-700 bg-slate-900 p-2 shadow-xl">
      <div className="flex items-center gap-1">
        <button type="button" aria-label={replaceMode ? 'Nascondi sostituzione' : 'Mostra sostituzione'} aria-expanded={replaceMode} className={iconButton} onClick={() => onReplaceMode(!replaceMode)}>
          {replaceMode ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <input ref={findInput} value={query} aria-label="Trova" placeholder="Trova" className={`${inputClass} ${error && query ? 'border-rose-500' : ''}`} onChange={(event) => setQuery(event.target.value)} onKeyDown={onFindKeyDown} />
        <button type="button" title="Maiuscole/minuscole" aria-label="Maiuscole e minuscole" aria-pressed={options.caseSensitive} className={optionButton(options.caseSensitive)} onClick={() => toggle('caseSensitive')}>Aa</button>
        <button type="button" title="Parola intera" aria-label="Parola intera" aria-pressed={options.wholeWord} className={optionButton(options.wholeWord)} onClick={() => toggle('wholeWord')}>ab</button>
        <button type="button" title="Espressione regolare" aria-label="Espressione regolare" aria-pressed={options.regex} className={optionButton(options.regex)} onClick={() => toggle('regex')}>.*</button>
      </div>
      <div className="flex items-center gap-1 pl-8">
        <span className={`min-w-0 flex-1 truncate text-xs ${error && query ? 'text-rose-400' : 'text-slate-500'}`} title={error || ''}>{status}</span>
        <button type="button" title="Precedente (Maiusc+Invio)" aria-label="Occorrenza precedente" disabled={!count} className={iconButton} onClick={() => goToMatch(editor, -1)}><ArrowUp size={15} /></button>
        <button type="button" title="Successiva (Invio)" aria-label="Occorrenza successiva" disabled={!count} className={iconButton} onClick={() => goToMatch(editor, 1)}><ArrowDown size={15} /></button>
        <button type="button" title="Chiudi (Esc)" aria-label="Chiudi la ricerca" className={iconButton} onClick={onClose}><X size={15} /></button>
      </div>
      {replaceMode && (
        <div className="flex items-center gap-1 pl-8">
          <input ref={replaceInput} value={replacement} aria-label="Sostituisci con" placeholder="Sostituisci con" className={inputClass} onChange={(event) => setReplacement(event.target.value)} onKeyDown={onReplaceKeyDown} />
          <button type="button" disabled={!count} className="rounded bg-slate-700 px-2 py-1 text-xs text-slate-100 transition hover:bg-slate-600 disabled:opacity-40" onClick={() => { if (replaceCurrent(editor, replacement)) goToMatch(editor, 0) }}>Sostituisci</button>
          <button type="button" disabled={!count} className="rounded bg-accent-600 px-2 py-1 text-xs text-white transition hover:bg-accent-500 disabled:opacity-40" onClick={() => replaceAll(editor, replacement)}>Tutti</button>
        </div>
      )}
    </div>
  )
}
