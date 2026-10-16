import { useEffect, useRef, useState } from 'react'
import { getMarkRange } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { Bold, Check, Code, ExternalLink, Image as ImageIcon, Italic, Link as LinkIcon, Pencil, Strikethrough, Trash2, Unlink, X } from 'lucide-react'
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
export default function SelectionToolbar({ editor, containerRef, request, documentPath, onOpenLink, onReplaceImage }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => (current
      ? {
        link: current.isActive('link'),
        image: current.isActive('image'),
        href: current.getAttributes('link').href || '',
        imageHref: current.isActive('image') ? current.getAttributes('image').href || '' : '',
        empty: current.state.selection.empty,
        bold: current.isActive('bold'),
        italic: current.isActive('italic'),
        strike: current.isActive('strike'),
        code: current.isActive('code'),
      }
      : { link: false, image: false, href: '', imageHref: '', empty: true, bold: false, italic: false, strike: false, code: false }),
  })
  const settled = useSettledSelection(editor)
  // In modifica: { mode: 'link' | 'selection' | 'create', range, originalText, text, url } oppure, per un'immagine, { mode: 'image', range, alt, title }.
  const [editing, setEditing] = useState(null)
  const urlRef = useRef(null)

  function linkRange() {
    const { doc, selection, schema } = editor.state
    return getMarkRange(doc.resolve(selection.from), schema.marks.link) || { from: selection.from, to: selection.to }
  }

  function startEdit() {
    const { doc, selection } = editor.state
    if (editor.isActive('image')) {
      const attributes = editor.getAttributes('image')
      setEditing({ mode: 'image', range: { from: selection.from, to: selection.to }, alt: attributes.alt || '', title: attributes.title || '', url: attributes.href || '' })
    } else if (editor.isActive('link')) {
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
    if (editing.mode === 'image') {
      // Testo alternativo (per chi non vede l'immagine) e titolo (suggerimento al passaggio del mouse): finiscono nel Markdown come ![alt](src "titolo").
      // Nel Markdown il testo alternativo sta tra [ ] e il titolo tra virgolette, su una riga: si ripuliscono i caratteri che romperebbero la sintassi.
      const alt = editing.alt.replace(/\s+/g, ' ').replace(/\[/g, '(').replace(/\]/g, ')').trim()
      const title = editing.title.replace(/\s+/g, ' ').replace(/"/g, "'").trim()
      // Indirizzo a cui porta l'immagine (facoltativo, vuoto = nessun link): nel Markdown diventa [![alt](src)](indirizzo).
      const current = editor.getAttributes('image')
      chain.setNodeSelection(editing.range.from).updateAttributes('image', { alt, title: title || null, href: url || null, linkTitle: url ? current.linkTitle || null : null }).run()
    } else if (editing.mode === 'link') {
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
  if (editing?.mode === 'image') {
    // Indirizzo del link, titolo su una riga, poi il testo alternativo in un'area di testo (di solito è una frase intera). Invio applica; la barra si allarga in altezza.
    const onAltKeyDown = (event) => {
      if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); apply() } else onKeyDown(event)
    }
    content = (
      <div className="grid w-80 gap-1.5 p-0.5">
        <div className="flex items-center gap-1">
          <input
            ref={urlRef}
            value={editing.url}
            aria-label={t('Link address')}
            placeholder={t('Link address (optional): where the image leads')}
            className={`${fieldClass} flex-1`}
            onChange={(event) => setEditing({ ...editing, url: event.target.value })}
            onKeyDown={onKeyDown}
          />
          <FloatingButton label={t('Apply')} onClick={apply}><Check size={15} /></FloatingButton>
          <FloatingButton label={t('Cancel')} onClick={finish}><X size={15} /></FloatingButton>
        </div>
        <input
          value={editing.title}
          aria-label={t('Title (tooltip)')}
          placeholder={t('Title (tooltip)')}
          className={`${fieldClass} w-full`}
          onChange={(event) => setEditing({ ...editing, title: event.target.value })}
          onKeyDown={onKeyDown}
        />
        <textarea
          value={editing.alt}
          rows={4}
          aria-label={t('Alternative text')}
          placeholder={t('Alternative text: describe the image for those who cannot see it')}
          className="w-full resize-none rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs leading-5 text-slate-100 outline-none placeholder:text-slate-500 focus:border-accent-400"
          onChange={(event) => setEditing({ ...editing, alt: event.target.value })}
          onKeyDown={onAltKeyDown}
        />
      </div>
    )
  } else if (editing) {
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
  } else if (state.image) {
    // Un'immagine selezionata: gli strumenti del testo non servono; si può sceglierne un'altra o toglierla.
    content = (
      <>
        <FloatingButton label={t('Edit description and link')} onClick={startEdit}><Pencil size={14} /></FloatingButton>
        <FloatingButton label={state.imageHref ? t('Edit the image link') : t('Link the image…')} onClick={startEdit}><LinkIcon size={14} /></FloatingButton>
        {state.imageHref && <FloatingButton label={t('Open link')} onClick={() => onOpenLink?.(resolveDocumentLink(state.imageHref, documentPath))}><ExternalLink size={14} /></FloatingButton>}
        <FloatingButton label={t('Choose another image…')} onClick={onReplaceImage}><ImageIcon size={14} /></FloatingButton>
        <FloatingButton label={t('Remove image')} danger onClick={() => editor.chain().focus().deleteSelection().run()}><Trash2 size={14} /></FloatingButton>
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
