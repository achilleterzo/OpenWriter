import { useEffect, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Markdown } from '@tiptap/markdown'
import Heading from '@tiptap/extension-heading'
import StarterKit from '@tiptap/starter-kit'
import DocumentToolbar from './DocumentToolbar.jsx'
import FindBar from './FindBar.jsx'
import { Annotations } from '../lib/annotationExtension.js'
import { Search } from '../lib/searchExtension.js'

// Ogni scheda monta il proprio editor: così cronologia di annullamento e scroll restano per documento.
export default function DocumentPane({ tab, active, findRequest, onReady, onDirty, onNoteSelect }) {
  const [findOpen, setFindOpen] = useState(false)
  const [replaceMode, setReplaceMode] = useState(false)
  const [focusToken, setFocusToken] = useState(0)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, link: { openOnClick: false } }),
      Heading.configure({ levels: [1, 2, 3, 4, 5, 6, 7] }),
      Markdown,
      Annotations.configure({ onSelect: (id) => onNoteSelect?.(id) }),
      Search,
    ],
    content: tab.content,
    contentType: tab.contentType,
    onUpdate: () => onDirty(tab.id),
  })

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
      <DocumentToolbar editor={editor} onFind={() => { if (findOpen) closeFind(); else { setFindOpen(true); setFocusToken((value) => value + 1) } }} findOpen={findOpen} />
      <div className="relative min-h-0 flex-1">
        {findOpen && <FindBar editor={editor} replaceMode={replaceMode} onReplaceMode={setReplaceMode} focusToken={focusToken} onClose={closeFind} />}
        <div className="h-full overflow-y-auto" data-document-scroll={tab.id}>
          <EditorContent editor={editor} className="document-editor mx-auto" />
        </div>
      </div>
    </div>
  )
}
