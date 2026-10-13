import {
  Bold,
  Check,
  Code2,
  Copy,
  FileCode,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Save,
  Search,
  Strikethrough,
  Undo2,
} from 'lucide-react'
import { useEditorState } from '@tiptap/react'
import { ToolbarButton, ToolbarDivider, ToolbarGroup } from './ToolbarButton.jsx'
import { t } from '../i18n/index.js'
import { useDialogs } from './Dialogs.jsx'
import { useState } from 'react'

const headingLevels = [1, 2, 3, 4, 5, 6, 7]

export default function DocumentToolbar({ editor, onImage, onFind, findOpen, onSave, dirty, sourceOpen, onToggleSource, onCopySource }) {
  const [copied, setCopied] = useState(false)
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
      taskList: currentEditor.isActive('taskList'),
      blockquote: currentEditor.isActive('blockquote'),
      codeBlock: currentEditor.isActive('codeBlock'),
    }),
  })
  const headingLevel = active.headingLevel
  const currentBlock = headingLevel ? `h${headingLevel}` : 'paragraph'

  const dialogs = useDialogs()

  async function setLink() {
    if (active.link) {
      editor.chain().focus().unsetLink().run()
      return
    }

    const url = (await dialogs.prompt(t('Link URL')))?.trim()
    if (url) editor.chain().focus().setLink({ href: url }).run()
  }

  const saveButton = (
      <ToolbarButton label={t('Save (Ctrl+S)')} active={Boolean(dirty)} onClick={onSave}><Save size={17} /></ToolbarButton>
  )

  // Vista sorgente: la barra mostra solo salvataggio, copia e ritorno alla vista formattata.
  if (sourceOpen) {
    return (
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-800 bg-slate-950/40 p-3">
        {saveButton}
        <ToolbarDivider />
        <ToolbarButton label={copied ? t('Copied') : t('Copy all')} onClick={() => { onCopySource(); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>{copied ? <Check size={17} /> : <Copy size={17} />}</ToolbarButton>
        <span className="ml-2 text-xs text-slate-500">{t('Markdown source: changes are applied to the document as you type.')}</span>
        <span className="ml-auto"><ToolbarButton label={t('Back to the formatted view')} active onClick={onToggleSource}><FileCode size={17} /></ToolbarButton></span>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-1 border-b border-slate-800 bg-slate-950/40 p-3">
      <ToolbarGroup>
        {saveButton}
      </ToolbarGroup>
      <ToolbarGroup>
        <label className="sr-only" htmlFor="block-type">{t('Block type')}</label>
        <select
          id="block-type"
          aria-label={t('Block type')}
          value={currentBlock}
          className="mr-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-2 text-sm text-slate-200 outline-none focus:border-accent-400"
          onChange={(event) => {
            const value = event.target.value
            if (value === 'paragraph') editor.chain().focus().setParagraph().run()
            else editor.chain().focus().setHeading({ level: Number(value.slice(1)) }).run()
          }}
        >
          <option value="paragraph">{t('Paragraph')}</option>
          {headingLevels.map((level) => <option key={level} value={`h${level}`}>H{level}</option>)}
        </select>
      </ToolbarGroup>
      <ToolbarGroup>
        <ToolbarButton label={t('Bold')} active={active.bold} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={17} /></ToolbarButton>
        <ToolbarButton label={t('Italic')} active={active.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={17} /></ToolbarButton>
        <ToolbarButton label={t('Strikethrough')} active={active.strike} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={17} /></ToolbarButton>
        <ToolbarButton label={t('Inline code')} active={active.code} onClick={() => editor.chain().focus().toggleCode().run()}><Code2 size={17} /></ToolbarButton>
        <ToolbarButton label={t('Link')} active={active.link} onClick={setLink}><LinkIcon size={17} /></ToolbarButton>
        <ToolbarButton label={t('Insert image…')} onClick={onImage}><ImageIcon size={17} /></ToolbarButton>
      </ToolbarGroup>
      <ToolbarGroup>
        <ToolbarButton label={t('Bulleted list')} active={active.bulletList} onClick={() => editor.chain().focus().toggleBulletList().run()}><List size={17} /></ToolbarButton>
        <ToolbarButton label={t('Numbered list')} active={active.orderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={17} /></ToolbarButton>
        <ToolbarButton label={t('Task list')} active={active.taskList} onClick={() => editor.chain().focus().toggleTaskList().run()}><ListChecks size={17} /></ToolbarButton>
        <ToolbarButton label={t('Quote')} active={active.blockquote} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={17} /></ToolbarButton>
        <ToolbarButton label={t('Code block')} active={active.codeBlock} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code2 size={17} /></ToolbarButton>
        <ToolbarButton label={t('Horizontal rule')} onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus size={17} /></ToolbarButton>
      </ToolbarGroup>
      <ToolbarGroup>
        <ToolbarButton label={t('Undo')} onClick={() => editor.chain().focus().undo().run()}><Undo2 size={17} /></ToolbarButton>
        <ToolbarButton label={t('Redo')} onClick={() => editor.chain().focus().redo().run()}><Redo2 size={17} /></ToolbarButton>
      </ToolbarGroup>
      <ToolbarGroup>
        <ToolbarButton label={t('Find and replace (Ctrl+F)')} active={findOpen} onClick={onFind}><Search size={17} /></ToolbarButton>
        <ToolbarButton label={t('Markdown source')} onClick={onToggleSource}><FileCode size={17} /></ToolbarButton>
      </ToolbarGroup>
    </div>
  )
}
