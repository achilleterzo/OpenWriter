import { EditorContent, useEditor } from '@tiptap/react'
import { Markdown } from '@tiptap/markdown'
import Heading from '@tiptap/extension-heading'
import StarterKit from '@tiptap/starter-kit'
import useDocumentFileCommands from '../hooks/useDocumentFileCommands.js'
import DocumentToolbar from './DocumentToolbar.jsx'

export default function DocumentEditor({ onStatusChange }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, link: { openOnClick: false } }),
      Heading.configure({ levels: [1, 2, 3, 4, 5, 6, 7] }),
      Markdown,
    ],
    content: '<h2>Inizia a scrivere</h2><p>Questo è il tuo nuovo documento.</p>',
  })

  useDocumentFileCommands(editor, onStatusChange)

  if (!editor) return null

  return (
    <div className="flex flex-1 flex-col">
      <DocumentToolbar editor={editor} />
      <EditorContent editor={editor} className="document-editor flex-1" />
    </div>
  )
}
