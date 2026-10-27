import { useEditorState } from '@tiptap/react'
import { Anchor } from 'lucide-react'
import { collectAnchors } from '../lib/rawMarkdownExtensions.js'
import { t } from '../i18n/index.js'

// Le ancore HTML del documento (`<a id="nome"></a>`), nell'ordine in cui compaiono: l'id e, subito dopo, il testo a cui si riferiscono (con i puntini se lungo).
function Anchors({ editor }) {
  const serialized = useEditorState({
    editor,
    selector: ({ editor: current }) => JSON.stringify(collectAnchors(current.state.doc)),
  })
  const anchors = JSON.parse(serialized)

  if (!anchors.length) return <p className="px-3 py-3 text-xs text-slate-500">{t('No anchors in the document.')}</p>

  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-1">
      {anchors.map((anchor, index) => (
        <button
          key={`${anchor.pos}-${index}`}
          type="button"
          title={`#${anchor.id}${anchor.text ? ` — ${anchor.text}` : ''}`}
          className="flex w-full items-baseline gap-2 py-1 pl-3 pr-2 text-left text-sm text-slate-400 transition hover:bg-slate-800/70 hover:text-slate-50"
          onClick={() => editor.chain().focus().setNodeSelection(anchor.pos).scrollIntoView().run()}
        >
          <Anchor size={12} className="shrink-0 self-center text-accent-400" />
          <span className="max-w-[45%] shrink-0 truncate font-mono text-xs text-slate-300">{anchor.id}</span>
          <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{anchor.text}</span>
        </button>
      ))}
    </div>
  )
}

export default function AnchorsPanel({ editor }) {
  return editor ? <Anchors editor={editor} /> : <p className="px-3 py-3 text-xs text-slate-500">{t('No document open.')}</p>
}
