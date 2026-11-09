import { useEffect, useRef, useState } from 'react'
import { FolderSearch, ListOrdered, Save, Search } from 'lucide-react'
import SourceEditor from './SourceEditor.jsx'
import TextFindBar from './TextFindBar.jsx'
import { t } from '../i18n/index.js'

const electronAPI = window.electronAPI
const button = 'rounded p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-50 disabled:opacity-30'
const toggled = (on) => `rounded p-1.5 transition ${on ? 'bg-accent-500/20 text-accent-300' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-50'}`

const formatBytes = (size) => (size >= 1048576 ? `${(size / 1048576).toFixed(1)} MB` : size >= 1024 ? `${Math.round(size / 1024)} KB` : `${size} B`)

/**
 * Lettore testuale: un file di testo qualsiasi (codice, configurazioni, registri…) che si legge e si modifica com'è, senza interpretarlo come Markdown.
 * Riusa il campo della vista sorgente (SourceEditor), con i numeri di riga attivabili, la ricerca con evidenziazione e la sostituzione.
 * Il testo sta qui (come in un documento sta nell'editor): l'applicazione lo chiede con `getText` per salvare e per la sessione, e riceve solo i passaggi
 * da pulito a modificato (`onDirty`, `onClean`).
 */
export default function TextPane({ tab, active, findRequest, lineNumbers, onToggleLineNumbers, onRegister, onDirty, onClean, onSave, onInteract, onStatus }) {
  const [text, setText] = useState(tab.text)
  const textRef = useRef(tab.text)
  // Il testo com'è sul disco (null: non si sa, per esempio una bozza ripresa dalla sessione, che quindi conta come modificata).
  const savedRef = useRef(tab.savedText ?? null)
  const dirtyRef = useRef(Boolean(tab.dirty))
  const [findOpen, setFindOpen] = useState(false)
  const [replaceMode, setReplaceMode] = useState(false)
  const [focusToken, setFocusToken] = useState(0)
  const [initialQuery, setInitialQuery] = useState('')
  const [marks, setMarks] = useState(null)
  const [reveal, setReveal] = useState(null)
  const root = useRef(null)
  const lastFind = useRef(findRequest?.nonce || 0)

  const apply = (next) => {
    textRef.current = next
    setText(next)
    const dirty = savedRef.current === null || next !== savedRef.current
    if (dirty !== dirtyRef.current) {
      dirtyRef.current = dirty
      if (dirty) onDirty(tab.id); else onClean(tab.id)
    }
  }

  useEffect(() => {
    onRegister(tab.id, {
      getText: () => textRef.current,
      // Dopo un salvataggio il testo di riferimento è quello scritto.
      markSaved: (saved) => { savedRef.current = saved; dirtyRef.current = textRef.current !== saved },
    })
    return () => onRegister(tab.id, null)
  }, [tab.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl+F / Ctrl+H (o il menu): si apre la barra, partendo dal testo selezionato se è su una riga.
  useEffect(() => {
    if (!active || !findRequest?.nonce || findRequest.nonce === lastFind.current) return
    lastFind.current = findRequest.nonce
    const selected = String(window.getSelection?.() || '')
    setInitialQuery(selected && !selected.includes('\n') ? selected : '')
    setFindOpen(true)
    setReplaceMode(Boolean(findRequest.replace))
    setFocusToken((value) => value + 1)
  }, [findRequest?.nonce, active]) // eslint-disable-line react-hooks/exhaustive-deps

  const closeFind = () => {
    setFindOpen(false)
    setMarks(null)
    root.current?.querySelector('textarea')?.focus()
  }

  const lines = text ? text.split('\n').length : 0
  const details = [
    `${lines.toLocaleString()} ${lines === 1 ? t('line') : t('lines')}`,
    formatBytes(new Blob([text]).size),
    tab.eol === 'crlf' ? 'CRLF' : 'LF',
    tab.bom ? 'UTF-8 BOM' : 'UTF-8',
  ].join(' · ')

  return (
    <div ref={root} className={`${active ? 'flex min-h-0 flex-1 flex-col' : 'hidden'} outline-none`} onMouseDown={() => onInteract?.(tab.id)}>
      <div className="flex items-center gap-1 border-b border-slate-800 bg-slate-950/40 px-3 py-1.5 text-xs text-slate-400">
        <span className="min-w-0 flex-1 truncate" title={tab.textPath || tab.title}><span className="text-slate-200">{tab.title}</span><span className="ml-2">{details}</span></span>
        <button type="button" aria-label={t('Line numbers')} title={t('Line numbers')} aria-pressed={lineNumbers} className={toggled(lineNumbers)} onClick={onToggleLineNumbers}><ListOrdered size={15} /></button>
        <button type="button" aria-label={t('Find and replace')} title={t('Find and replace')} aria-pressed={findOpen} className={toggled(findOpen)} onClick={() => { if (findOpen) closeFind(); else { setInitialQuery(''); setFindOpen(true); setFocusToken((value) => value + 1) } }}><Search size={15} /></button>
        <button type="button" aria-label={t('Save')} title={t('Save')} disabled={!tab.dirty} className={button} onClick={onSave}><Save size={15} /></button>
        {tab.textPath && (
          <button type="button" aria-label={t('Show in file manager')} title={t('Show in file manager')} className={button} onClick={() => electronAPI.revealPath(tab.textPath).catch((reason) => onStatus?.(reason.message))}><FolderSearch size={15} /></button>
        )}
      </div>
      <div className="relative min-h-0 flex-1">
        {findOpen && (
          <TextFindBar
            text={text}
            onText={apply}
            onMarks={setMarks}
            onReveal={(position) => setReveal({ position, nonce: Date.now() + Math.random() })}
            replaceMode={replaceMode}
            onReplaceMode={setReplaceMode}
            focusToken={focusToken}
            initialQuery={initialQuery}
            onClose={closeFind}
          />
        )}
        <SourceEditor value={text} onChange={apply} label={tab.title} lineNumbers={lineNumbers} plain marks={marks} reveal={reveal} readOnly={Boolean(tab.readOnly)} />
      </div>
    </div>
  )
}
