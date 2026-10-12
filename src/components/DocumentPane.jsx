import { useEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Markdown } from '@tiptap/markdown'
import Code from '@tiptap/extension-code'
import Heading from '@tiptap/extension-heading'
import StarterKit from '@tiptap/starter-kit'
import DocumentToolbar from './DocumentToolbar.jsx'
import FindBar from './FindBar.jsx'
import { Annotations } from '../lib/annotationExtension.js'
import { Search } from '../lib/searchExtension.js'
import { DocumentImage } from '../lib/imageExtension.js'
import { displaySource, isInside, dirname, sourceForImage } from '../lib/imagePaths.js'
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
export default function DocumentPane({ tab, project, active, findRequest, onReady, onDirty, onNoteSelect, onStatus }) {
  const [findOpen, setFindOpen] = useState(false)
  const [replaceMode, setReplaceMode] = useState(false)
  const [focusToken, setFocusToken] = useState(0)

  // Percorso del documento e progetto sempre aggiornati, per risolvere le immagini anche dopo "Salva con nome".
  const context = useRef({})
  context.current = { documentPath: tab.filePath || null, project }

  // Inserisce un'immagine: `imagePath` è il file da riferire; `copy` lo porta prima nella cartella images/ del progetto.
  async function insertImage(editor, { imagePath, copy, data, mime, name }) {
    const { documentPath, project: current } = context.current
    try {
      if (!documentPath) throw new Error(t('Save the document first to add images'))
      let target = imagePath
      if (data || (copy && !(isInside(imagePath, current) || isInside(imagePath, dirname(documentPath))))) {
        target = await electronAPI.importImage({ sourcePath: data ? undefined : imagePath, data, mime, name })
      }
      const alt = String(name || target.split(/[\\/]/).pop()).replace(/\.[^.]*$/, '')
      editor.chain().focus().setImage({ src: sourceForImage(target, documentPath, current), alt }).run()
    } catch (error) {
      onStatus?.(error.message)
    }
  }

  const editor = useEditor({
    editorProps: {
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
      DocumentImage.configure({ resolveSource: (src) => displaySource(src, context.current.documentPath) }),
      StarterKit.configure({ heading: false, code: false, link: { openOnClick: false } }),
      // Un link può racchiudere codice in linea ([`file.md`](url)): nello schema predefinito il codice esclude ogni altro marchio e il Markdown non sarebbe valido.
      Code.extend({ excludes: 'bold italic strike' }),
      Heading.configure({ levels: [1, 2, 3, 4, 5, 6, 7] }),
      Markdown,
      Annotations.configure({ onSelect: (id) => onNoteSelect?.(id) }),
      Search,
    ],
    content: tab.content,
    contentType: tab.contentType,
    onUpdate: () => onDirty(tab.id),
  })

  const editorRef = useRef(null)
  editorRef.current = editor

  async function pickImage() {
    const imagePath = await electronAPI.pickImage()
    if (imagePath) insertImage(editor, { imagePath })
  }

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

  if (!editor) return null

  return (
    <div className={active ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
      <DocumentToolbar editor={editor} onImage={pickImage} onFind={() => { if (findOpen) closeFind(); else { setFindOpen(true); setFocusToken((value) => value + 1) } }} findOpen={findOpen} />
      <div className="relative min-h-0 flex-1">
        {findOpen && <FindBar editor={editor} replaceMode={replaceMode} onReplaceMode={setReplaceMode} focusToken={focusToken} onClose={closeFind} />}
        <div className="h-full overflow-y-auto" data-document-scroll={tab.id}>
          <EditorContent editor={editor} className="document-editor mx-auto" />
        </div>
      </div>
    </div>
  )
}
