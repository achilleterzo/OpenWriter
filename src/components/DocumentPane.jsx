import { useEffect, useRef, useState } from 'react'
import { FileText } from 'lucide-react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Markdown } from '@tiptap/markdown'
import Code from '@tiptap/extension-code'
import { AlignedBlocks, AlignedHeading, AlignedParagraph, TextAlign } from '../lib/textAlignExtension.js'
import StarterKit from '@tiptap/starter-kit'
import DocumentToolbar from './DocumentToolbar.jsx'
import FindBar from './FindBar.jsx'
import { Annotations } from '../lib/annotationExtension.js'
import { Bookmarks } from '../lib/bookmarkExtension.js'
import { Search } from '../lib/searchExtension.js'
import { KeepSelection } from '../lib/keepSelectionExtension.js'
import { DocumentImage } from '../lib/imageExtension.js'
import { markdownTarget } from '../lib/markdownSyntax.js'
import { MathBlock, MathInline } from '../lib/mathExtensions.js'
import { AlertBlockquote } from '../lib/alertExtension.js'
import { MarkdownItalic, SafeMarks } from '../lib/markExtensions.js'
import { SmartDashes } from '../lib/smartDashesExtension.js'
import { PendingChanges, acceptAll, getPending, pendingKey, rejectAll, restorePending } from '../lib/pendingChangesExtension.js'
import { useEditorState } from '@tiptap/react'
import Link from '@tiptap/extension-link'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { FrontMatter, HtmlBlock, HtmlInline } from '../lib/rawMarkdownExtensions.js'
import { FootnoteDefinition, FootnoteRef } from '../lib/footnoteExtensions.js'
import { MarkdownListItem } from '../lib/listItemExtension.js'
import { mergeAttributes } from '@tiptap/core'
import SelectionToolbar from './SelectionToolbar.jsx'
import ChangeMarkers from './ChangeMarkers.jsx'
import SourceEditor from './SourceEditor.jsx'
import { displaySource, isInside, dirname, resolveDocumentLink, sourceForImage } from '../lib/imagePaths.js'
import { t } from '../i18n/index.js'

const electronAPI = window.electronAPI
const IMAGE_PATTERN = /\.(png|jpe?g|gif|webp|bmp)$/i

const toBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
  reader.onerror = () => reject(reader.error)
  reader.readAsDataURL(file)
})

// Ogni scheda monta il proprio editor: così cronologia di annullamento e scroll restano per documento.
// Il collegamento mostra dove punta (tooltip) e si apre con Ctrl+clic: il clic semplice resta per posizionare il cursore e modificare il testo.
const DocumentLink = Link.configure({ openOnClick: false }).extend({
  renderHTML({ HTMLAttributes }) {
    return ['a', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, { title: t('{target} — Ctrl+click to open', { target: HTMLAttributes.href }) }), 0]
  },
  renderMarkdown(node, helpers) {
    const href = node.attrs?.href ?? ''
    const text = helpers.renderChildren(node)
    return `[${text}](${markdownTarget(href, node.attrs?.title ?? '')})`
  },
  // Un link che racchiude solo un'immagine diventa un'immagine con il suo link (vedi imageExtension.js).
  parseMarkdown(token, helpers) {
    const only = token.tokens?.length === 1 && token.tokens[0].type === 'image' ? token.tokens[0] : null
    if (only) return helpers.createNode('image', { src: only.href, title: only.title, alt: only.text, href: token.href, linkTitle: token.title || null })
    return helpers.applyMark('link', helpers.parseInline(token.tokens || []), { href: token.href, title: token.title || null })
  },
})

function LiveDocumentPane({ tab, project, active, findRequest, onReady, onDirty, onClean, onInteract, onCheckAi, onPendingRestored, onPendingChange, onNoteSelect, onBookmarkSelect, onStatus, onOpenLink, onSave, onDiscuss }) {
  // Vista sorgente: il Markdown grezzo del documento in un campo di testo. È solo un modo di lavorare o copiare il testo:
  // note, assistente e ricerca restano sull'editor visuale, che si aggiorna man mano che si scrive.
  const [sourceOpen, setSourceOpen] = useState(false)
  const [sourceText, setSourceText] = useState('')
  const sourceTimer = useRef(null)
  const sourceLatest = useRef('')
  const applyingSource = useRef(false)
  // Testo (Markdown dell'editor) all'ultimo salvataggio o apertura; null finché non è noto (es. una bozza ripristinata).
  const savedMarkdown = useRef(null)
  const cleanTimer = useRef(null)
  const [findOpen, setFindOpen] = useState(false)
  const [replaceMode, setReplaceMode] = useState(false)
  const [focusToken, setFocusToken] = useState(0)

  // Percorso del documento e progetto sempre aggiornati, per risolvere le immagini anche dopo "Salva con nome".
  const context = useRef({})
  context.current = { documentPath: tab.filePath || null, project }

  // Inserisce un'immagine: `imagePath` è il file da riferire, `data` un'immagine incollata. Se il file non è già raggiungibile dal documento
  // (dentro il progetto, o nella cartella del documento) o non ha un file, si copia accanto al documento (sottocartella images/): resta nel progetto.
  async function insertImage(editor, { imagePath, data, mime, name }) {
    const { documentPath, project: current } = context.current
    try {
      if (!documentPath) throw new Error(t('Save the document first to add images'))
      let target = imagePath
      const reachable = Boolean(imagePath) && (isInside(imagePath, dirname(documentPath)) || Boolean(current && isInside(documentPath, current) && isInside(imagePath, current)))
      if (data || !reachable) {
        target = await electronAPI.importImage({ documentPath, sourcePath: data ? undefined : imagePath, data, mime, name })
      }
      const alt = String(name || target.split(/[\\/]/).pop()).replace(/\.[^.]*$/, '')
      editor.chain().focus().setImage({ src: sourceForImage(target, documentPath, current), alt }).run()
    } catch (error) {
      onStatus?.(error.message)
    }
  }

  // Barra fluttuante dei collegamenti: `linkRequest` cambia a ogni richiesta di inserire o modificare un collegamento (Ctrl+K o pulsante).
  const [linkRequest, setLinkRequest] = useState(0)
  const editorArea = useRef(null)

  const editor = useEditor({
    editorProps: {
      handleKeyDown(view, event) {
        if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'k') {
          event.preventDefault()
          setLinkRequest((value) => value + 1)
          return true
        }
        return false
      },
      handleClick(view, pos, event) {
        if (!(event.ctrlKey || event.metaKey)) return false
        const anchor = event.target?.closest?.('a[href]')
        const target = anchor?.getAttribute('href') || event.target?.closest?.('img[data-href]')?.getAttribute('data-href')
        if (!target) return false
        event.preventDefault()
        onOpenLink?.(resolveDocumentLink(target, context.current.documentPath))
        return true
      },
      handlePaste(view, event) {
        const file = Array.from(event.clipboardData?.files || []).find((item) => item.type.startsWith('image/'))
        if (!file) return false
        event.preventDefault()
        toBase64(file).then((data) => insertImage(editorRef.current, { data, mime: file.type, name: file.name }))
        return true
      },
      handleDrop(view, event) {
        const files = Array.from(event.dataTransfer?.files || []).filter((item) => IMAGE_PATTERN.test(item.name))
        if (!files.length) return false
        event.preventDefault()
        const paths = electronAPI.getDroppedPaths(files)
        files.forEach((file, index) => {
          if (paths[index]) insertImage(editorRef.current, { imagePath: paths[index] })
          else toBase64(file).then((data) => insertImage(editorRef.current, { data, mime: file.type, name: file.name }))
        })
        return true
      },
    },
    extensions: [
      DocumentImage.configure({ allowBase64: true, resolveSource: (src) => displaySource(src, context.current.documentPath) }),
      StarterKit.configure({ heading: false, code: false, link: false, listItem: false, blockquote: false, paragraph: false, italic: false }),
      MarkdownItalic,
      AlignedParagraph,
      TextAlign,
      AlignedBlocks,
      AlertBlockquote,
      MarkdownListItem,
      DocumentLink,
      // Un link può racchiudere codice in linea ([`file.md`](url)): nello schema predefinito il codice esclude ogni altro marchio e il Markdown non sarebbe valido.
      Code.extend({ excludes: 'bold italic strike' }),
      AlignedHeading.configure({ levels: [1, 2, 3, 4, 5, 6, 7] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      // Tabelle GFM: senza queste estensioni le righe con "|" sparivano all'apertura (e quindi anche dal file al salvataggio).
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      FrontMatter,
      HtmlBlock,
      HtmlInline,
      FootnoteRef,
      MathInline,
      MathBlock,
      FootnoteDefinition,
      Markdown,
      SafeMarks,
      SmartDashes,
      Annotations.configure({ onSelect: (id) => onNoteSelect?.(id) }),
      Bookmarks.configure({ onSelect: (id) => onBookmarkSelect?.(id) }),
      Search,
      KeepSelection,
      PendingChanges.configure({ labels: { caption: t('Edited by the assistant'), accept: t('Accept'), reject: t('Reject') } }),
    ],
    content: tab.content,
    contentType: tab.contentType,
    editable: !tab.readOnly,
    onUpdate: () => {
      onDirty(tab.id)
      // Dopo una pausa si confronta con il testo salvato: se coincide (es. dopo "Annulla") la scheda torna "non modificata".
      clearTimeout(cleanTimer.current)
      cleanTimer.current = setTimeout(() => {
        const current = editorRef.current
        if (current && !current.isDestroyed && savedMarkdown.current !== null && current.getMarkdown() === savedMarkdown.current) onClean?.(tab.id)
      }, 300)
    },
  })

  const editorRef = useRef(null)
  editorRef.current = editor
  const interact = () => { if (tab.preview) onInteract?.(tab.id) }

  // Quando la scheda non è modificata (appena aperta o salvata) quello che c'è nell'editor è il testo di riferimento.
  useEffect(() => {
    if (editor && !tab.dirty) savedMarkdown.current = editor.getMarkdown()
  }, [editor, tab.dirty, tab.filePath])

  function applySource(text) {
    const current = editorRef.current
    if (!current) return
    applyingSource.current = true
    try {
      if (text.trim()) current.chain().insertContentAt({ from: 0, to: current.state.doc.content.size }, text, { contentType: 'markdown' }).run()
      else current.chain().clearContent(true).run()
    } finally {
      applyingSource.current = false
    }
  }

  function flushSource() {
    if (sourceTimer.current === null) return
    clearTimeout(sourceTimer.current)
    sourceTimer.current = null
    applySource(sourceLatest.current)
  }

  function toggleSource() {
    if (sourceOpen) {
      flushSource()
      setSourceOpen(false)
    } else {
      const text = editorRef.current.getMarkdown()
      sourceLatest.current = text
      setSourceText(text)
      setSourceOpen(true)
      setFindOpen(false)
    }
  }

  function editSource(text) {
    setSourceText(text)
    sourceLatest.current = text
    clearTimeout(sourceTimer.current)
    sourceTimer.current = setTimeout(() => { sourceTimer.current = null; applySource(text) }, 500)
  }

  // Se il documento cambia per altre vie mentre la vista sorgente è aperta (per esempio le modifiche dell'assistente), il testo si aggiorna.
  useEffect(() => {
    if (!editor || !sourceOpen) return undefined
    const refresh = () => {
      if (applyingSource.current || sourceTimer.current !== null) return
      const text = editor.getMarkdown()
      sourceLatest.current = text
      setSourceText(text)
    }
    editor.on('update', refresh)
    return () => editor.off('update', refresh)
  }, [editor, sourceOpen])

  async function pickImage() {
    const imagePath = await electronAPI.pickImage()
    if (imagePath) insertImage(editor, { imagePath })
  }

  // Modifiche dell'assistente rimaste in sosta in una sessione precedente: si rimettono da rivedere appena l'editor è pronto.
  useEffect(() => {
    if (!editor || !tab.pending) return
    restorePending(editor, tab.pending)
    onPendingRestored?.(tab.id)
    // Solo alla prima apertura del documento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  // Accettare o rifiutare una modifica cambia ciò che va salvato nella sessione: la si salva anche se il testo non è cambiato.
  useEffect(() => {
    if (!editor) return undefined
    const onTransaction = ({ transaction }) => { if (transaction.getMeta(pendingKey)) onPendingChange?.() }
    editor.on('transaction', onTransaction)
    return () => editor.off('transaction', onTransaction)
  }, [editor, onPendingChange])

  useEffect(() => {
    if (!editor) return undefined
    onReady(tab.id, editor)
    return () => onReady(tab.id, null)
  }, [editor, tab.id, onReady])

  useEffect(() => {
    if (active && editor) editor.commands.focus()
  }, [active, editor])

  // Ctrl+F / Ctrl+H (o l'icona) aprono la barra solo nel documento attivo.
  useEffect(() => {
    if (!active || !findRequest?.nonce) return
    setFindOpen(true)
    setReplaceMode(Boolean(findRequest.replace))
    setFocusToken((value) => value + 1)
    // Reagisce solo a una nuova richiesta, non ai cambi di scheda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findRequest?.nonce])

  function closeFind() {
    setFindOpen(false)
    editor?.commands.focus()
  }

  // Modifiche dell'assistente ancora da rivedere in questo documento.
  const pendingCount = useEditorState({ editor, selector: ({ editor: current }) => (current ? getPending(current.state).length : 0) })

  if (!editor) return null

  return (
    <div className={active ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
      <DocumentToolbar editor={editor} onSave={onSave} dirty={tab.dirty} sourceOpen={sourceOpen} onToggleSource={toggleSource} aiScore={tab.aiScore} onCheckAi={onCheckAi} onCopySource={() => navigator.clipboard.writeText(sourceLatest.current)} onImage={pickImage} onLink={() => { editor.commands.focus(); setLinkRequest((value) => value + 1) }} onFind={() => { if (findOpen) closeFind(); else { setFindOpen(true); setFocusToken((value) => value + 1) } }} findOpen={findOpen} />
      {pendingCount > 0 && !sourceOpen && (
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-emerald-400/10 px-4 py-2 text-xs text-slate-200">
          <span>{t('{count} edits to review', { count: pendingCount })}</span>
          <button type="button" className="rounded bg-emerald-400/20 px-2 py-1 font-medium text-emerald-300 transition hover:bg-emerald-400/35" onClick={() => acceptAll(editor)}>{t('Accept all')}</button>
          <button type="button" className="rounded bg-rose-400/20 px-2 py-1 font-medium text-rose-300 transition hover:bg-rose-400/35" onClick={() => rejectAll(editor)}>{t('Reject all')}</button>
        </div>
      )}
      <div ref={editorArea} className="relative min-h-0 flex-1">
        {findOpen && !sourceOpen && <FindBar editor={editor} replaceMode={replaceMode} onReplaceMode={setReplaceMode} focusToken={focusToken} onClose={closeFind} />}
        {sourceOpen && (
          <SourceEditor value={sourceText} label={t('Markdown source')} onChange={editSource} />
        )}
        {/* Qualunque operazione sul documento (anche uno scorrimento o un clic) toglie alla scheda lo stato di anteprima. */}
        <div className={`document-scroll h-full overflow-y-auto ${sourceOpen ? 'hidden' : ''}`} data-document-scroll={tab.id} onScroll={interact} onWheel={interact} onMouseDown={interact} onKeyDown={interact}>
          <EditorContent editor={editor} className="document-editor mx-auto" />
        </div>
        {!sourceOpen && <ChangeMarkers editor={editor} containerRef={editorArea} onSelectNote={onNoteSelect} />}
        {!sourceOpen && <SelectionToolbar editor={editor} containerRef={editorArea} request={linkRequest} documentPath={tab.filePath || null} onOpenLink={onOpenLink} onReplaceImage={pickImage} onDiscuss={onDiscuss && ((text, options) => onDiscuss({ text, title: tab.title, filePath: tab.filePath || null }, options))} />}
      </div>
    </div>
  )
}

// Scheda fissata chiusa: nessun documento caricato, solo il pulsante per riaprirlo.
function ClosedDocumentPane({ tab, active, onReopen }) {
  return (
    <div className={active ? 'flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center' : 'hidden'}>
      <FileText size={36} className="text-slate-600" />
      <p className="text-sm font-medium text-slate-300">{tab.title}</p>
      <p className="max-w-md break-all text-xs text-slate-500">{tab.sourcePath}</p>
      <button type="button" autoFocus className="rounded-md bg-accent-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-accent-500" onClick={onReopen}>{t('Open')}</button>
    </div>
  )
}

export default function DocumentPane(props) {
  return props.tab.closed ? <ClosedDocumentPane {...props} /> : <LiveDocumentPane {...props} />
}
