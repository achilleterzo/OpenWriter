import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const key = new PluginKey('owKeepSelection')

// Quando l'editor perde il focus (per scrivere una nota, usare la barra degli strumenti, la chat…) la selezione del browser
// sparisce anche se resta nello stato: si disegna come evidenziazione finché il focus non torna.
export const KeepSelection = Extension.create({
  name: 'keepSelection',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key,
        state: {
          init: () => false,
          apply(transaction, value) {
            const meta = transaction.getMeta(key)
            return meta === undefined ? value : meta
          },
        },
        props: {
          decorations(state) {
            if (!key.getState(state)) return null
            const { from, to, empty } = state.selection
            return empty ? null : DecorationSet.create(state.doc, [Decoration.inline(from, to, { class: 'ow-selection-kept' })])
          },
          handleDOMEvents: {
            blur(view) { view.dispatch(view.state.tr.setMeta(key, true)); return false },
            focus(view) { view.dispatch(view.state.tr.setMeta(key, false)); return false },
          },
        },
      }),
    ]
  },
})
