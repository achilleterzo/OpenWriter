import { useRef } from 'react'
import { useEditorState } from '@tiptap/react'
import { t } from '../i18n/index.js'

function headingsOf(editor) {
  const headings = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading' && node.textContent.trim()) headings.push({ pos, level: node.attrs.level, text: node.textContent })
  })
  return headings
}

function Outline({ editor, onJump }) {
  const cache = useRef({ doc: null, value: '[]' })
  const serialized = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const { doc } = current.state
      if (cache.current.doc !== doc) cache.current = { doc, value: JSON.stringify(headingsOf(current)) }
      return cache.current.value
    },
  })
  const items = JSON.parse(serialized)

  if (!items.length) return <p className="px-3 py-3 text-xs text-slate-500">{t('No headings in the document.')}</p>

  return (
    <div className="min-h-0 flex-1 overflow-y-auto py-1">
      {items.map((item) => (
        <button
          key={item.pos}
          type="button"
          style={{ paddingLeft: 12 + (item.level - 1) * 12 }}
          className="block w-full truncate py-1 pr-2 text-left text-sm text-slate-400 transition hover:bg-slate-800/70 hover:text-slate-50"
          onClick={() => { onJump?.(); editor.chain().focus().setTextSelection(item.pos + 1).scrollIntoView().run() }}
        >
          {item.text}
        </button>
      ))}
    </div>
  )
}

export default function OutlinePanel({ editor, onJump }) {
  return editor ? <Outline editor={editor} onJump={onJump} /> : <p className="px-3 py-3 text-xs text-slate-500">{t('No document open.')}</p>
}
