import {
  Bold,
  Code2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from 'lucide-react'
import { useEditorState } from '@tiptap/react'
import { ToolbarButton, ToolbarDivider } from './ToolbarButton.jsx'

const headingLevels = [1, 2, 3, 4, 5, 6, 7]

export default function DocumentToolbar({ editor }) {
  const active = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      headingLevel: currentEditor.isActive('heading') ? currentEditor.getAttributes('heading').level : null,
      bold: currentEditor.isActive('bold'),
      italic: currentEditor.isActive('italic'),
      strike: currentEditor.isActive('strike'),
      code: currentEditor.isActive('code'),
      link: currentEditor.isActive('link'),
      bulletList: currentEditor.isActive('bulletList'),
      orderedList: currentEditor.isActive('orderedList'),
      blockquote: currentEditor.isActive('blockquote'),
      codeBlock: currentEditor.isActive('codeBlock'),
    }),
  })
  const headingLevel = active.headingLevel
  const currentBlock = headingLevel ? `h${headingLevel}` : 'paragraph'

  function setLink() {
    if (active.link) {
      editor.chain().focus().unsetLink().run()
      return
    }

    const url = window.prompt('URL del collegamento')
    if (url) editor.chain().focus().setLink({ href: url }).run()
  }

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-slate-800 bg-slate-950/40 p-3">
      <label className="sr-only" htmlFor="block-type">Tipo di blocco</label>
      <select
        id="block-type"
        aria-label="Tipo di blocco"
        value={currentBlock}
        className="mr-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-slate-200 outline-none focus:border-cyan-400"
        onChange={(event) => {
          const value = event.target.value
          if (value === 'paragraph') editor.chain().focus().setParagraph().run()
          else editor.chain().focus().setHeading({ level: Number(value.slice(1)) }).run()
        }}
      >
        <option value="paragraph">Paragrafo</option>
        {headingLevels.map((level) => <option key={level} value={`h${level}`}>H{level}</option>)}
      </select>

      <ToolbarDivider />
      <ToolbarButton label="Grassetto" active={active.bold} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={17} /></ToolbarButton>
      <ToolbarButton label="Corsivo" active={active.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={17} /></ToolbarButton>
      <ToolbarButton label="Barrato" active={active.strike} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={17} /></ToolbarButton>
      <ToolbarButton label="Codice inline" active={active.code} onClick={() => editor.chain().focus().toggleCode().run()}><Code2 size={17} /></ToolbarButton>
      <ToolbarButton label="Collegamento" active={active.link} onClick={setLink}><LinkIcon size={17} /></ToolbarButton>

      <ToolbarDivider />
      <ToolbarButton label="Elenco puntato" active={active.bulletList} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={17} /></ToolbarButton>
      <ToolbarButton label="Elenco numerato" active={active.orderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={17} /></ToolbarButton>
      <ToolbarButton label="Citazione" active={active.blockquote} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={17} /></ToolbarButton>
      <ToolbarButton label="Blocco codice" active={active.codeBlock} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code2 size={17} /></ToolbarButton>
      <ToolbarButton label="Linea orizzontale" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus size={17} /></ToolbarButton>

      <ToolbarDivider />
      <ToolbarButton label="Annulla" onClick={() => editor.chain().focus().undo().run()}><Undo2 size={17} /></ToolbarButton>
      <ToolbarButton label="Ripeti" onClick={() => editor.chain().focus().redo().run()}><Redo2 size={17} /></ToolbarButton>
    </div>
  )
}
