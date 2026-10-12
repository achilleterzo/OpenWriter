import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { buildTextIndex, toRange } from './anchoring.js'

export const searchKey = new PluginKey('owSearch')

const MAX_MATCHES = 5000
// Lettere, numeri e "_" anche accentati: \b di JavaScript conosce solo l'ASCII.
const WORD = '[\\p{L}\\p{N}_]'
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const emptyParams = { query: '', caseSensitive: false, wholeWord: false, regex: false }

// Espressione di ricerca (globale, per trovare tutte le occorrenze) e una per calcolare il testo sostitutivo di una singola occorrenza.
export function buildMatchers({ query, caseSensitive, wholeWord, regex }) {
  if (!query) return { search: null, single: null }
  const source = regex ? query : escapeRegExp(query)
  const wrapped = wholeWord ? `(?<!${WORD})(?:${source})(?!${WORD})` : source
  const flags = caseSensitive ? 'u' : 'iu'
  try {
    return { search: new RegExp(wrapped, `g${flags}`), single: new RegExp(source, flags) }
  } catch (error) {
    return { search: null, single: null, error: error.message }
  }
}

// Occorrenze nel testo del documento. Quelle che attraversano più blocchi (contengono "\n") o sono vuote vengono ignorate.
function findMatches(doc, search) {
  const index = buildTextIndex(doc)
  const matches = []
  for (const match of index.text.matchAll(search)) {
    if (!match[0].length || match[0].includes('\n')) continue
    const range = toRange(index, { index: match.index, length: match[0].length })
    if (range && range.to > range.from) matches.push({ ...range, text: match[0] })
    if (matches.length >= MAX_MATCHES) break
  }
  return matches
}

function compute(doc, params, current, selectionFrom) {
  const { search, error } = buildMatchers(params)
  const matches = search ? findMatches(doc, search) : []
  let next = current
  if (!matches.length) next = -1
  else if (next === 'nearest') next = Math.max(0, matches.findIndex((match) => match.from >= selectionFrom)) || 0
  else if (next < 0 || next >= matches.length) next = Math.min(Math.max(next, 0), matches.length - 1)
  const decorations = matches.map((match, position) => Decoration.inline(match.from, match.to, { class: position === next ? 'ow-find ow-find-current' : 'ow-find' }))
  return { params, matches, current: next, error: error || null, decorations: DecorationSet.create(doc, decorations) }
}

// Evidenzia le occorrenze della ricerca come decorazioni: il documento non viene toccato.
export const Search = Extension.create({
  name: 'search',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: searchKey,
        state: {
          init: (_config, state) => compute(state.doc, emptyParams, -1, 0),
          apply(transaction, value, _oldState, newState) {
            const meta = transaction.getMeta(searchKey)
            if (!meta && !transaction.docChanged) return value
            const params = meta?.params ?? value.params
            return compute(newState.doc, params, meta?.current ?? value.current, newState.selection.from)
          },
        },
        props: { decorations: (state) => searchKey.getState(state).decorations },
      }),
    ]
  },
})

export const getSearchState = (editor) => searchKey.getState(editor.state)

// Imposta (o azzera, con query vuota) la ricerca e porta il "corrente" sulla prima occorrenza dal cursore.
export function setSearch(editor, params) {
  if (!editor || editor.isDestroyed) return
  editor.view.dispatch(editor.state.tr.setMeta(searchKey, { params: { ...emptyParams, ...params }, current: 'nearest' }))
}

export function goToMatch(editor, delta) {
  const { matches, current } = getSearchState(editor)
  if (!matches.length) return
  const target = (current + delta + matches.length) % matches.length
  const match = matches[target]
  const { tr } = editor.state
  editor.view.dispatch(tr.setMeta(searchKey, { current: target }).setSelection(TextSelection.create(tr.doc, match.from, match.to)).scrollIntoView())
}

function replacementFor(match, params, replacement) {
  if (!params.regex) return replacement
  const { single } = buildMatchers(params)
  // Con le espressioni regolari valgono i gruppi di cattura ($1, $&…).
  return single ? match.text.replace(single, replacement) : replacement
}

// Sostituisce l'occorrenza corrente; la successiva scorre nello stesso indice, quindi si può ripetere.
export function replaceCurrent(editor, replacement) {
  const { matches, current, params } = getSearchState(editor)
  const match = matches[current]
  if (!match) return false
  editor.view.dispatch(editor.state.tr.insertText(replacementFor(match, params, replacement), match.from, match.to))
  return true
}

// Tutte le sostituzioni in una sola transazione (un solo Ctrl+Z), dall'ultima alla prima per non spostare le posizioni.
export function replaceAll(editor, replacement) {
  const { matches, params } = getSearchState(editor)
  if (!matches.length) return 0
  const { tr } = editor.state
  for (const match of [...matches].reverse()) tr.insertText(replacementFor(match, params, replacement), match.from, match.to)
  editor.view.dispatch(tr)
  return matches.length
}
