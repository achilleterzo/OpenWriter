import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { buildTextIndex, locateNote } from './anchoring.js'

export const annotationKey = new PluginKey('owAnnotations')

function buildDecorations(doc, notes, activeId) {
  // Senza note non c'è nulla da cercare: indicizzare il testo di un documento grande a ogni battuta costa inutilmente.
  if (!notes.length) return DecorationSet.empty
  const index = buildTextIndex(doc)
  const decorations = []
  for (const note of notes) {
    const location = locateNote(doc, note, index)
    if (!location || location.to <= location.from) continue
    // Aperte: evidenziazione piena (commento o suggerimento); chiuse (risolte, accettate, rifiutate): evidenziatore sottile.
    const kind = note.status === 'open' ? `ow-note ow-note-${note.kind}` : 'ow-note-done'
    decorations.push(Decoration.inline(location.from, location.to, {
      class: `${kind}${note.id === activeId ? ' ow-note-active' : ''}`,
      'data-note-id': note.id,
      title: note.body,
    }))
  }
  return DecorationSet.create(doc, decorations)
}

// Evidenzia nel testo le note senza modificare il documento: sono solo decorazioni.
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

// Aggiorna le note mostrate in un editor: tutte, con un'evidenziazione diversa per quelle aperte e per quelle chiuse.
export function setAnnotations(editor, notes, activeId = null) {
  if (!editor || editor.isDestroyed) return
  editor.view.dispatch(editor.state.tr.setMeta(annotationKey, { notes: notes || [], activeId }))
}
