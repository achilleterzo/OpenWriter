import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { buildTextIndex, locateQuote } from './anchoring.js'

export const annotationKey = new PluginKey('owAnnotations')

function buildDecorations(doc, notes, activeId) {
  const index = buildTextIndex(doc)
  const decorations = []
  for (const note of notes) {
    const location = locateQuote(doc, note, index)
    if (!location || location.to <= location.from) continue
    decorations.push(Decoration.inline(location.from, location.to, {
      class: `ow-note ow-note-${note.kind}${note.id === activeId ? ' ow-note-active' : ''}`,
      'data-note-id': note.id,
      title: note.body,
    }))
  }
  return DecorationSet.create(doc, decorations)
}

// Evidenzia nel testo le note aperte senza modificare il documento: sono solo decorazioni.
export const Annotations = Extension.create({
  name: 'annotations',

  addOptions() {
    return { onSelect: () => {} }
  },

  addProseMirrorPlugins() {
    const { onSelect } = this.options
    return [
      new Plugin({
        key: annotationKey,
        state: {
          init: () => ({ notes: [], activeId: null, decorations: DecorationSet.empty }),
          apply(transaction, value, _oldState, newState) {
            const meta = transaction.getMeta(annotationKey)
            if (!meta && !transaction.docChanged) return value
            const notes = meta ? meta.notes : value.notes
            const activeId = meta ? meta.activeId : value.activeId
            return { notes, activeId, decorations: buildDecorations(newState.doc, notes, activeId) }
          },
        },
        props: {
          decorations: (state) => annotationKey.getState(state).decorations,
          handleClick(_view, _pos, event) {
            const element = event.target instanceof Element ? event.target.closest('[data-note-id]') : null
            if (element) onSelect(element.getAttribute('data-note-id'))
            return false
          },
        },
      }),
    ]
  },
})

// Aggiorna le note mostrate in un editor (solo quelle aperte vengono evidenziate).
export function setAnnotations(editor, notes, activeId = null) {
  if (!editor || editor.isDestroyed) return
  const open = (notes || []).filter((note) => note.status === 'open')
  editor.view.dispatch(editor.state.tr.setMeta(annotationKey, { notes: open, activeId }))
}
