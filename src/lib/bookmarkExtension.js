import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { buildTextIndex, locateQuote } from './anchoring.js'

export const bookmarkKey = new PluginKey('owBookmarks')

const ICON = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>'

function marker(bookmark) {
  const element = document.createElement('span')
  element.className = `ow-bookmark-marker${bookmark.flagged ? ' ow-bookmark-marker-flagged' : ''}`
  element.contentEditable = 'false'
  element.dataset.bookmarkId = bookmark.id
  element.title = [bookmark.label || `#${bookmark.name}`, bookmark.note].filter(Boolean).join('\n')
  element.innerHTML = ICON
  return element
}

function buildDecorations(doc, bookmarks, activeId) {
  const index = buildTextIndex(doc)
  const decorations = []
  for (const bookmark of bookmarks) {
    const location = locateQuote(doc, bookmark, index)
    if (!location) continue
    decorations.push(Decoration.widget(location.from, () => marker(bookmark), { side: -1, key: `bm:${bookmark.id}:${bookmark.flagged}:${bookmark.label}:${bookmark.note}`, ignoreSelection: true }))
    if (location.to > location.from) {
      decorations.push(Decoration.inline(location.from, location.to, {
        class: `ow-bookmark-range${bookmark.flagged ? ' ow-bookmark-flagged' : ''}${bookmark.id === activeId ? ' ow-bookmark-active' : ''}`,
        'data-bookmark-id': bookmark.id,
      }))
    }
  }
  return DecorationSet.create(doc, decorations)
}

// Mostra nel testo i segnalibri senza modificare il documento: sono solo decorazioni (un segno all'inizio del punto e una sottolineatura).
export const Bookmarks = Extension.create({
  name: 'bookmarks',

  addOptions() {
    return { onSelect: () => {} }
  },

  addProseMirrorPlugins() {
    const { onSelect } = this.options
    return [
      new Plugin({
        key: bookmarkKey,
        state: {
          init: () => ({ bookmarks: [], activeId: null, decorations: DecorationSet.empty }),
          apply(transaction, value, _oldState, newState) {
            const meta = transaction.getMeta(bookmarkKey)
            if (!meta && !transaction.docChanged) return value
            const bookmarks = meta ? meta.bookmarks : value.bookmarks
            const activeId = meta ? meta.activeId : value.activeId
            return { bookmarks, activeId, decorations: buildDecorations(newState.doc, bookmarks, activeId) }
          },
        },
        props: {
          decorations: (state) => bookmarkKey.getState(state).decorations,
          handleClick(_view, _pos, event) {
            const element = event.target instanceof Element ? event.target.closest('[data-bookmark-id]') : null
            if (element) onSelect(element.getAttribute('data-bookmark-id'))
            return false
          },
        },
      }),
    ]
  },
})

export function setBookmarks(editor, bookmarks, activeId = null) {
  if (!editor || editor.isDestroyed) return
  editor.view.dispatch(editor.state.tr.setMeta(bookmarkKey, { bookmarks: bookmarks || [], activeId }))
}
