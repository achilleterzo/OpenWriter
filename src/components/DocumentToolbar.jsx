import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  BetweenHorizontalEnd,
  BetweenVerticalEnd,
  Bold,
  Check,
  Code2,
  Copy,
  FileCode,
  Gauge,
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
  Table2,
  Trash2,
  Undo2,
} from 'lucide-react'
import { useEditorState } from '@tiptap/react'
import { ToolbarButton, ToolbarDivider, ToolbarGroup } from './ToolbarButton.jsx'
import ToolbarMenu from './ToolbarMenu.jsx'
import { t } from '../i18n/index.js'
import { useState } from 'react'

const headingLevels = [1, 2, 3, 4, 5, 6, 7]

// Risultato del controllo "quanto sembra scritto da un'AI": una pillola colorata con il punteggio. È solo un'indicazione dell'assistente.
function AiScoreBadge({ score }) {
  const tone = score.score >= 60 ? 'border-rose-400/50 bg-rose-400/10 text-rose-300' : score.score >= 30 ? 'border-amber-400/50 bg-amber-400/10 text-amber-300' : 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'
  const confidence = { low: t('low confidence'), medium: t('medium confidence'), high: t('high confidence') }[score.confidence] || ''
  const details = [
    `${t('AI likelihood')}: ${score.score}/100 (${confidence})`,
    score.rationale,
    score.stale ? t('The text has changed since this check: run it again.') : '',
    t('It is only an indication by the AI assistant, not proof: formal, technical or non-native writing is often mistaken for AI text.'),
  ].filter(Boolean).join('\n\n')
  return (
    <span title={details} className={`ml-1 flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tone} ${score.stale ? 'opacity-60' : ''}`}>
      AI {score.score}%{score.confidence === 'low' && <span aria-hidden="true">?</span>}{score.stale && <span className="font-normal italic">{t('(outdated)')}</span>}
    </span>
  )
}

export default function DocumentToolbar({ editor, onImage, onFind, findOpen, onLink, onSave, dirty, sourceOpen, onToggleSource, onCopySource, aiScore, onCheckAi }) {
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
      table: currentEditor.isActive('table'),
      align: currentEditor.getAttributes('paragraph').align || currentEditor.getAttributes('heading').align || 'left',
    }),
  })
  const headingLevel = active.headingLevel
  const alignItems = [
    { value: 'left', label: t('Left aligned'), icon: <AlignLeft size={17} />, hint: 'Ctrl+Shift+L' },
    { value: 'center', label: t('Centered'), icon: <AlignCenter size={17} />, hint: 'Ctrl+Shift+E' },
    { value: 'right', label: t('Right aligned'), icon: <AlignRight size={17} />, hint: 'Ctrl+Shift+R' },
    { value: 'justify', label: t('Justified'), icon: <AlignJustify size={17} />, hint: 'Ctrl+Shift+J' },
  ]
  const listItems = [
    { value: 'bullet', label: t('Bulleted list'), icon: <List size={17} /> },
    { value: 'ordered', label: t('Numbered list'), icon: <ListOrdered size={17} /> },
    { value: 'task', label: t('Task list'), icon: <ListChecks size={17} /> },
  ]
  const currentList = active.bulletList ? 'bullet' : active.orderedList ? 'ordered' : active.taskList ? 'task' : 'none'
  // Cambiare tipo converte la lista in cui ci si trova.
  const toggleList = { bullet: () => editor.chain().focus().toggleBulletList().run(), ordered: () => editor.chain().focus().toggleOrderedList().run(), task: () => editor.chain().focus().toggleTaskList().run() }
  const changeList = (value) => {
    // Sceglierne di nuovo il tipo attuale toglie l'elenco.
    toggleList[value]()
  }
  const currentBlock = headingLevel ? `h${headingLevel}` : 'paragraph'

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
        <ToolbarMenu
          label={t('Text alignment')}
          icon={(alignItems.find((item) => item.value === active.align) || alignItems[0]).icon}
          items={alignItems}
          value={active.align}
          onSelect={(align) => editor.chain().focus().setTextAlign(align).run()}
        />
      </ToolbarGroup>
      <ToolbarGroup>
        <ToolbarButton label={t('Bold')} active={active.bold} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={17} /></ToolbarButton>
        <ToolbarButton label={t('Italic')} active={active.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={17} /></ToolbarButton>
        <ToolbarButton label={t('Strikethrough')} active={active.strike} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={17} /></ToolbarButton>
        <ToolbarButton label={t('Inline code')} active={active.code} onClick={() => editor.chain().focus().toggleCode().run()}><Code2 size={17} /></ToolbarButton>
        <ToolbarButton label={t('Link (Ctrl+K)')} active={active.link} onClick={onLink}><LinkIcon size={17} /></ToolbarButton>
        <ToolbarButton label={t('Insert image…')} onClick={onImage}><ImageIcon size={17} /></ToolbarButton>
      </ToolbarGroup>
      <ToolbarGroup>
        <ToolbarMenu
          label={t('List type')}
          icon={(listItems.find((item) => item.value === currentList) || listItems[0]).icon}
          items={listItems}
          value={currentList}
          active={currentList !== 'none'}
          onSelect={changeList}
        />
        <ToolbarButton label={t('Quote')} active={active.blockquote} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote size={17} /></ToolbarButton>
        <ToolbarButton label={t('Code block')} active={active.codeBlock} onClick={() => editor.chain().focus().toggleCodeBlock().run()}><Code2 size={17} /></ToolbarButton>
        <ToolbarButton label={t('Horizontal rule')} onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus size={17} /></ToolbarButton>
        <ToolbarButton label={t('Insert table')} active={active.table} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table2 size={17} /></ToolbarButton>
      </ToolbarGroup>
      {active.table && (
        <ToolbarGroup>
          <ToolbarButton label={t('Add row below')} onClick={() => editor.chain().focus().addRowAfter().run()}><BetweenHorizontalEnd size={17} /></ToolbarButton>
          <ToolbarButton label={t('Add column to the right')} onClick={() => editor.chain().focus().addColumnAfter().run()}><BetweenVerticalEnd size={17} /></ToolbarButton>
          <ToolbarButton label={t('Delete row')} onClick={() => editor.chain().focus().deleteRow().run()}><Minus size={17} /></ToolbarButton>
          <ToolbarButton label={t('Delete column')} onClick={() => editor.chain().focus().deleteColumn().run()}><Minus size={17} className="rotate-90" /></ToolbarButton>
          <ToolbarButton label={t('Delete table')} onClick={() => editor.chain().focus().deleteTable().run()}><Trash2 size={17} /></ToolbarButton>
        </ToolbarGroup>
      )}
      <ToolbarGroup>
        <ToolbarButton label={t('Undo')} onClick={() => editor.chain().focus().undo().run()}><Undo2 size={17} /></ToolbarButton>
        <ToolbarButton label={t('Redo')} onClick={() => editor.chain().focus().redo().run()}><Redo2 size={17} /></ToolbarButton>
      </ToolbarGroup>
      <ToolbarGroup>
        <ToolbarButton label={t('Find and replace (Ctrl+F)')} active={findOpen} onClick={onFind}><Search size={17} /></ToolbarButton>
        <ToolbarButton label={t('Markdown source')} onClick={onToggleSource}><FileCode size={17} /></ToolbarButton>
      </ToolbarGroup>
      <ToolbarGroup>
        <ToolbarButton label={t('Check how AI-like the text is')} onClick={onCheckAi}><Gauge size={17} /></ToolbarButton>
        {aiScore && <AiScoreBadge score={aiScore} />}
      </ToolbarGroup>
    </div>
  )
}
