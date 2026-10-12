import { useEffect } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Markdown } from '@tiptap/markdown'
import Heading from '@tiptap/extension-heading'
import StarterKit from '@tiptap/starter-kit'
import DocumentToolbar from './DocumentToolbar.jsx'

// Ogni scheda monta il proprio editor: così cronologia di annullamento e scroll restano per documento.
export default function DocumentPane({ tab, active, onReady, onDirty }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, link: { openOnClick: false } }),
      Heading.configure({ levels: [1, 2, 3, 4, 5, 6, 7] }),
      Markdown,
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

  if (!editor) return null

  return (
    <div className={active ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
      <DocumentToolbar editor={editor} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <EditorContent editor={editor} className="document-editor mx-auto" />
      </div>
    </div>
  )
}
