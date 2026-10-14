import { useEffect, useRef, useState } from 'react'
import { getMarkRange } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { Bold, Check, Code, ExternalLink, Italic, Link as LinkIcon, Pencil, Strikethrough, Unlink, X } from 'lucide-react'
import FloatingToolbar, { FloatingButton, FloatingDivider } from './FloatingToolbar.jsx'
import { resolveDocumentLink } from '../lib/imagePaths.js'
import { t } from '../i18n/index.js'

const SETTLE_MS = 350
const fieldClass = 'h-7 min-w-0 rounded border border-slate-700 bg-slate-800 px-2 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-accent-400'

// Indirizzo scritto a mano: "esempio.it" diventa https://esempio.it; schemi (https:, mailto:), percorsi e ancore restano come sono.
function normalizeUrl(value) {
  const url = String(value || '').trim()
  if (!url) return ''
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || /^[/.#]/.test(url)) return url
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(url)) return `mailto:${url}`
  if (/^[^\s/]+\.[^\s/]{2,}(\/.*)?$/.test(url)) return `https://${url}`
  return url
}

// La selezione è "ferma": il mouse è rilasciato e da un momento non cambia più (così la barra non salta mentre si trascina o si estende
// con la tastiera). Ogni cambio la fa sparire; riappare quando smette.
function useSettledSelection(editor) {
  const [settled, setSettled] = useState(true)

  useEffect(() => {
    if (!editor) return undefined
    let timer = null
    let pointerDown = false
    const settleSoon = (delay) => {
      clearTimeout(timer)
      timer = setTimeout(() => setSettled(true), delay)
    }
    const onSelection = () => {
      setSettled(false)
      if (!pointerDown) settleSoon(SETTLE_MS)
    }
    const onDown = () => { pointerDown = true; clearTimeout(timer); setSettled(false) }
    const onUp = () => {
      if (!pointerDown) return
      pointerDown = false
      settleSoon(80)
    }
    const dom = editor.view.dom
    editor.on('selectionUpdate', onSelection)
    dom.addEventListener('mousedown', onDown)
    window.addEventListener('mouseup', onUp)
    return () => {
      clearTimeout(timer)
      editor.off('selectionUpdate', onSelection)
      dom.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
    }
  }, [editor])

  return settled
}

/**
 * Barra fluttuante della selezione: appare quando la selezione si ferma. Con del testo selezionato offre grassetto, corsivo, barrato e codice
 * e il collegamento; dentro un collegamento mostra dove punta (modifica, apri, togli). Ctrl+K, o il pulsante della barra del documento
 * (`request` cambia a ogni richiesta), apre la modifica del collegamento anche a cursore vuoto, per inserirne uno nuovo.
 */
export default function SelectionToolbar({ editor, containerRef, request, documentPath, onOpenLink }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => (current
      ? {
        link: current.isActive('link'),
        href: current.getAttributes('link').href || '',
        empty: current.state.selection.empty,
        bold: current.isActive('bold'),
        italic: current.isActive('italic'),
        strike: current.isActive('strike'),
        code: current.isActive('code'),
      }
      : { link: false, href: '', empty: true, bold: false, italic: false, strike: false, code: false }),
  })
  const settled = useSettledSelection(editor)
  // In modifica: { mode: 'link' | 'selection' | 'create', range, originalText, text, url }.
  const [editing, setEditing] = useState(null)
  const urlRef = useRef(null)

  function linkRange() {
    const { doc, selection, schema } = editor.state
    return getMarkRange(doc.resolve(selection.from), schema.marks.link) || { from: selection.from, to: selection.to }
  }

  function startEdit() {
    const { doc, selection } = editor.state
    if (editor.isActive('link')) {
      const range = linkRange()
      const text = doc.textBetween(range.from, range.to)
      setEditing({ mode: 'link', range, originalText: text, text, url: editor.getAttributes('link').href || '' })
    } else if (!selection.empty) {
      setEditing({ mode: 'selection', range: { from: selection.from, to: selection.to }, originalText: '', text: doc.textBetween(selection.from, selection.to), url: '' })
    } else {
      setEditing({ mode: 'create', range: { from: selection.from, to: selection.to }, originalText: '', text: '', url: '' })
    }
  }

  // Richiesta dall'esterno (Ctrl+K o pulsante della barra): la richiesta iniziale (0) non fa nulla.
  useEffect(() => {
    if (request) startEdit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  // Spostando la selezione altrove, la modifica in corso si annulla.
  useEffect(() => {
    if (!editing) return undefined
    const cancelIfMoved = () => {
      const { from, to } = editor.state.selection
      if (from < editing.range.from || to > editing.range.to) setEditing(null)
    }
    editor.on('selectionUpdate', cancelIfMoved)
    return () => editor.off('selectionUpdate', cancelIfMoved)
  }, [editor, editing])

  useEffect(() => {
    if (editing) urlRef.current?.focus()
  }, [editing?.mode, editing?.range.from])

  // In modifica la barra resta; altrimenti compare solo a selezione ferma.
  const open = Boolean(editing) || (settled && (state.link || !state.empty))

  function finish() {
    setEditing(null)
    editor.commands.focus()
  }

  function apply() {
    const url = normalizeUrl(editing.url)
    const chain = editor.chain().focus()
    if (editing.mode === 'link') {
      const text = editing.text.trim()
      if (!url) chain.setTextSelection(editing.range).unsetLink().run()
      else if (text && editing.text !== editing.originalText) chain.insertContentAt(editing.range, { type: 'text', text: editing.text, marks: [{ type: 'link', attrs: { href: url } }] }).run()
      else chain.setTextSelection(editing.range).setLink({ href: url }).run()
    } else if (editing.mode === 'selection') {
      if (url) chain.setTextSelection(editing.range).setLink({ href: url }).run()
    } else if (url) {
      chain.insertContent({ type: 'text', text: editing.text.trim() || url, marks: [{ type: 'link', attrs: { href: url } }] }).run()
    }
    setEditing(null)
  }

  function removeLink() {
    editor.chain().focus().setTextSelection(linkRange()).unsetLink().run()
  }

  function onKeyDown(event) {
    if (event.key === 'Enter') { event.preventDefault(); apply() }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish() }
  }

  let content
  if (editing) {
    content = (
      <>
        {editing.mode !== 'selection' && (
          <input
            value={editing.text}
            aria-label={t('Link text')}
            placeholder={t('Link text')}
            className={`${fieldClass} w-36`}
            onChange={(event) => setEditing({ ...editing, text: event.target.value })}
            onKeyDown={onKeyDown}
          />
        )}
        <input
          ref={urlRef}
          value={editing.url}
          aria-label={t('Link address')}
          placeholder={t('Link address')}
          className={`${fieldClass} w-56`}
          onChange={(event) => setEditing({ ...editing, url: event.target.value })}
          onKeyDown={onKeyDown}
        />
        <FloatingButton label={t('Apply')} onClick={apply}><Check size={15} /></FloatingButton>
        <FloatingButton label={t('Cancel')} onClick={finish}><X size={15} /></FloatingButton>
      </>
    )
  } else {
    const formatting = !state.empty && (
      <>
        <FloatingButton label={t('Bold')} active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={14} /></FloatingButton>
        <FloatingButton label={t('Italic')} active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={14} /></FloatingButton>
        <FloatingButton label={t('Strikethrough')} active={state.strike} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={14} /></FloatingButton>
        <FloatingButton label={t('Inline code')} active={state.code} onClick={() => editor.chain().focus().toggleCode().run()}><Code size={14} /></FloatingButton>
        <FloatingDivider />
      </>
    )
    const link = state.link
      ? (
        <>
          <span className="flex max-w-52 items-center gap-1.5 truncate px-1.5 text-xs text-slate-300" title={state.href}><LinkIcon size={13} className="shrink-0 text-accent-400" /><span className="truncate">{state.href}</span></span>
          <FloatingButton label={t('Edit link')} onClick={startEdit}><Pencil size={14} /></FloatingButton>
          <FloatingButton label={t('Open link')} onClick={() => onOpenLink?.(resolveDocumentLink(state.href, documentPath))}><ExternalLink size={14} /></FloatingButton>
          <FloatingButton label={t('Remove link')} danger onClick={removeLink}><Unlink size={14} /></FloatingButton>
        </>
      )
      : <FloatingButton label={t('Add link (Ctrl+K)')} onClick={startEdit}><LinkIcon size={14} /></FloatingButton>
    content = <>{formatting}{link}</>
  }

  return <FloatingToolbar editor={editor} containerRef={containerRef} open={open} label={t('Selection')}>{content}</FloatingToolbar>
}
