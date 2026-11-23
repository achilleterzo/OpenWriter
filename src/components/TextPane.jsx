import { useContext, useEffect, useRef, useState } from 'react'
import { FolderSearch, ListOrdered, Save, Search, Type } from 'lucide-react'
import { ContextMenuContext } from './ContextMenu.jsx'
import { describeLoss, replaceInTextarea, styleName } from '../lib/textFormat.js'
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
  // Il formato su disco (a capo e firma UTF-8) e quello di ora, che si sceglie dalla barra di stato: cambiarlo rende il file modificato anche se il testo è lo stesso.
  const formatDirty = tab.eol !== (tab.savedEol ?? tab.eol) || Boolean(tab.bom) !== Boolean(tab.savedBom ?? tab.bom)
  const formatDirtyRef = useRef(formatDirty)
  formatDirtyRef.current = formatDirty
  const [findOpen, setFindOpen] = useState(false)
  const [replaceMode, setReplaceMode] = useState(false)
  const [focusToken, setFocusToken] = useState(0)
  const [initialQuery, setInitialQuery] = useState('')
  const [marks, setMarks] = useState(null)
  const [reveal, setReveal] = useState(null)
  const root = useRef(null)
  const lastFind = useRef(findRequest?.nonce || 0)
  const openMenu = useContext(ContextMenuContext)
  // Gli stili Unicode (elenco e un esempio di ciascuno per il menu) si chiedono una volta sola.
  const stylesRef = useRef(null)
  // Le lettere accentate: 'keep' (di base: restano normali, perché molti programmi disegnano male l'accento combinato su una lettera con stile) o 'combine' (lettera con stile e accento combinato).
  const [accents, setAccents] = useState(() => (electronAPI.preferences?.values?.['openwriter.unicodeAccents'] === 'combine' ? 'combine' : 'keep'))

  const apply = (next) => {
    textRef.current = next
    setText(next)
    const dirty = savedRef.current === null || next !== savedRef.current || formatDirtyRef.current
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

  // Cambiando il formato dalla barra di stato il file diventa modificato, o torna pulito se si ripristina l'originale e il testo è lo stesso.
  useEffect(() => {
    const dirty = savedRef.current === null || textRef.current !== savedRef.current || formatDirty
    if (dirty !== dirtyRef.current) {
      dirtyRef.current = dirty
      if (dirty) onDirty(tab.id); else onClean(tab.id)
    }
  }, [formatDirty]) // eslint-disable-line react-hooks/exhaustive-deps

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

  async function loadStyles() {
    if (!stylesRef.current) {
      const list = await electronAPI.textFormat.styles()
      const samples = await Promise.all(list.map((style) => electronAPI.textFormat.stylize({ text: 'Aa', style: style.id })))
      stylesRef.current = { list, samples: Object.fromEntries(list.map((style, index) => [style.id, samples[index]])) }
    }
    return stylesRef.current
  }

  // Applica una trasformazione al testo selezionato (o, dove ha senso e non c'è una selezione, a tutto il file). `run(testo)` restituisce il testo nuovo, oppure
  // { text | markdown, lost, kept } per le conversioni; il campo lo sostituisce come una digitazione, quindi Ctrl+Z lo annulla.
  async function transform(run, { needsSelection = false, done } = {}) {
    const area = root.current?.querySelector('textarea')
    if (!area || tab.readOnly) return
    let from = area.selectionStart
    let to = area.selectionEnd
    if (from === to) {
      if (needsSelection) { onStatus?.(t('Select some text first')); return }
      from = 0
      to = textRef.current.length
    }
    if (from === to) return
    try {
      const source = textRef.current.slice(from, to)
      const result = await run(source)
      const next = typeof result === 'string' ? result : (result.text ?? result.markdown ?? '')
      if (next !== source && !replaceInTextarea(area, from, to, next)) apply(textRef.current.slice(0, from) + next + textRef.current.slice(to))
      const lost = typeof result === 'string' ? [] : result.lost || []
      onStatus?.(lost.length ? t('Converted. Not carried over: {items}', { items: describeLoss(lost) }) : done)
    } catch (reason) {
      onStatus?.(reason.message)
    }
  }

  async function openFormatMenu(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    try {
      const { list, samples } = await loadStyles()
      const style = (item) => ({
        label: styleName(item.id),
        hint: samples[item.id],
        // Come il pulsante del grassetto di un editor: sostituisce lo stile che c'è, e lo toglie se il testo ce l'ha già tutto.
        onClick: () => transform((source) => electronAPI.textFormat.apply({ text: source, style: item.id, accents }), { needsSelection: true, done: t('Text formatted') }),
      })
      const toggleAccents = () => {
        const next = accents === 'combine' ? 'keep' : 'combine'
        setAccents(next)
        electronAPI.preferences?.set('openwriter.unicodeAccents', next)
      }
      openMenu({
        x: rect.left,
        y: rect.bottom + 2,
        items: [
          { label: t('Unicode text style'), disabled: true },
          ...list.filter((item) => item.group === 'common').map(style),
          { separator: true },
          ...list.filter((item) => item.group === 'other').map(style),
          { separator: true },
          { label: t('Remove the style'), onClick: () => transform((source) => electronAPI.textFormat.unstyle(source), { done: t('Style removed') }) },
          { separator: true },
          { label: t('Convert Markdown to formatted text'), onClick: () => transform((source) => electronAPI.textFormat.toText({ text: source, accents }), { done: t('Converted') }) },
          { label: t('Convert formatted text to Markdown'), onClick: () => transform((source) => electronAPI.textFormat.toMarkdown({ text: source }), { done: t('Converted') }) },
          { separator: true },
          { label: `${accents === 'combine' ? '✓ ' : ''}${t('Style accented letters too (may not display well)')}`, onClick: toggleAccents },
        ],
      })
    } catch (reason) {
      onStatus?.(reason.message)
    }
  }

  const lines = text ? text.split('\n').length : 0
  const details = [
    `${lines.toLocaleString()} ${lines === 1 ? t('line') : t('lines')}`,
    formatBytes(new Blob([text]).size),
  ].join(' · ')

  return (
    <div ref={root} className={`${active ? 'flex min-h-0 flex-1 flex-col' : 'hidden'} outline-none`} onMouseDown={() => onInteract?.(tab.id)}>
      <div className="flex items-center gap-1 border-b border-slate-800 bg-slate-950/40 px-3 py-1.5 text-xs text-slate-400">
        <span className="min-w-0 flex-1 truncate" title={tab.textPath || tab.title}><span className="text-slate-200">{tab.title}</span><span className="ml-2">{details}</span></span>
        <button type="button" aria-label={t('Unicode text style')} title={t('Unicode text style')} aria-haspopup="menu" disabled={Boolean(tab.readOnly)} className={button} onMouseDown={(event) => event.preventDefault()} onClick={openFormatMenu}><Type size={15} /></button>
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
