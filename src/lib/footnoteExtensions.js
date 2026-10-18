import { Node } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

/**
 * Note a piè di pagina del Markdown esteso: il richiamo `[^id]` nel testo e la definizione `[^id]: testo` (anche su più righe rientrate).
 * Non si numerano né si collegano: restano com'erano scritti, riscritti identici al salvataggio. Senza queste estensioni `[^1]` veniva scritto `\[^1\]`
 * e la definizione veniva scambiata per una definizione di link, fondendola nel testo.
 */
const rawText = (node) => (node.content || []).map((child) => child.text || '').join('')

// Richiami e definizioni di un documento: conteggio per etichetta e totale.
function footnoteCounts(doc) {
  const refs = new Map()
  const definitions = new Map()
  let refTotal = 0
  let definitionTotal = 0
  doc.descendants((node) => {
    if (node.type.name === 'footnoteRef') { refs.set(node.attrs.label, (refs.get(node.attrs.label) || 0) + 1); refTotal += 1 }
    else if (node.type.name === 'footnoteDefinition') {
      definitionTotal += 1
      const found = /^\[\^([^\]\s]+)\]:/.exec(node.textContent)
      if (found) definitions.set(found[1], (definitions.get(found[1]) || 0) + 1)
      return false
    }
    return true
  })
  return { refs, definitions, refTotal, definitionTotal }
}

// Richiamo e definizione vanno via insieme: cancellando uno dei due si toglie anche l'altro (la definizione solo se non restano altri richiami con la stessa etichetta).
// Si agisce solo quando un elemento sparisce davvero (non quando si modifica a mano l'etichetta di una definizione).
function syncFootnotes(transactions, oldState, newState) {
  if (!transactions.some((transaction) => transaction.docChanged) || transactions.some((transaction) => transaction.getMeta('addToHistory') === false)) return null
  const before = footnoteCounts(oldState.doc)
  const after = footnoteCounts(newState.doc)
  const orphanRefs = after.definitionTotal < before.definitionTotal ? [...before.definitions.keys()].filter((label) => !after.definitions.has(label) && after.refs.has(label)) : []
  const orphanDefinitions = after.refTotal < before.refTotal ? [...before.refs.keys()].filter((label) => !after.refs.has(label) && after.definitions.has(label)) : []
  if (!orphanRefs.length && !orphanDefinitions.length) return null
  const ranges = []
  newState.doc.descendants((node, pos) => {
    if (node.type.name === 'footnoteRef' && orphanRefs.includes(node.attrs.label)) ranges.push([pos, pos + node.nodeSize])
    else if (node.type.name === 'footnoteDefinition') {
      const found = /^\[\^([^\]\s]+)\]:/.exec(node.textContent)
      if (found && orphanDefinitions.includes(found[1])) ranges.push([pos, pos + node.nodeSize])
      return false
    }
    return true
  })
  if (!ranges.length) return null
  const { tr } = newState
  for (const [from, to] of ranges.sort((x, y) => y[0] - x[0])) tr.delete(from, to)
  return tr
}

// Richiamo nel testo: un elemento indivisibile che mostra l'etichetta in apice.
export const FootnoteRef = Node.create({
  name: 'footnoteRef',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { label: { default: '', parseHTML: (element) => element.getAttribute('data-footnote-ref') || '' } }
  },
  parseHTML() { return [{ tag: 'sup[data-footnote-ref]' }] },
  renderHTML({ node }) { return ['sup', { 'data-footnote-ref': node.attrs.label, class: 'ow-footnote-ref' }, node.attrs.label] },

  addCommands() {
    return {
      // Inserisce un richiamo dopo la selezione e la sua definizione `[^n]: ` dopo le altre (o in fondo al documento), con il cursore pronto a scriverla.
      insertFootnote: () => ({ state, tr, dispatch }) => {
        const { schema, selection, doc } = state
        const refType = schema.nodes.footnoteRef
        const definitionType = schema.nodes.footnoteDefinition
        if (!refType || !definitionType) return false
        // Nei blocchi di testo grezzo (codice, definizioni) un richiamo non può stare.
        if (selection.$to.parent.type.spec.code) return false
        if (!dispatch) return true

        // Etichetta: il primo numero libero tra quelli già usati da richiami e definizioni.
        const used = new Set()
        doc.descendants((node) => {
          if (node.type === refType) used.add(node.attrs.label)
          else if (node.type === definitionType) { const found = /^\[\^([^\]\s]+)\]:/.exec(node.textContent); if (found) used.add(found[1]) }
        })
        let label = 1
        while (used.has(String(label))) label += 1

        let after = doc.content.size
        doc.forEach((node, offset) => { if (node.type === definitionType) after = offset + node.nodeSize })
        const prefix = `[^${label}]: `
        tr.insert(selection.to, refType.create({ label: String(label) }))
        // Il richiamo, se sta prima del punto scelto, lo sposta di una posizione.
        const position = selection.to <= after ? after + 1 : after
        tr.insert(position, definitionType.create(null, schema.text(prefix)))
        tr.setSelection(TextSelection.create(tr.doc, position + 1 + prefix.length))
        dispatch(tr.scrollIntoView())
        return true
      },
    }
  },

  markdownTokenName: 'footnoteRef',
  markdownTokenizer: {
    name: 'footnoteRef',
    level: 'inline',
    start: (src) => src.indexOf('[^'),
    tokenize(src) {
      const match = /^\[\^([^\]\s]+)\](?!:)/.exec(src)
      return match ? { type: 'footnoteRef', raw: match[0], label: match[1] } : undefined
    },
  },
  parseMarkdown: (token) => ({ type: 'footnoteRef', attrs: { label: token.label } }),
  renderMarkdown: (node) => `[^${node.attrs.label}]`,
})

// Definizione: blocco di testo grezzo (così le definizioni lunghe o con più paragrafi si conservano comunque).
const DEFINITION = /^\[\^([^\]\s]+)\]:[^\n]*(?:\n(?:[ \t]*\n)*[ \t]+\S[^\n]*)*(?:\n|$)/

export const FootnoteDefinition = Node.create({
  name: 'footnoteDefinition',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,

  parseHTML() { return [{ tag: 'pre[data-footnote-definition]', preserveWhitespace: 'full' }] },
  renderHTML() { return ['pre', { 'data-footnote-definition': '', class: 'ow-raw-block ow-footnote-definition' }, 0] },

  // Il testo resta grezzo (`[^1]: …`), ma fuori dal cursore l'inizio si disegna come numero in apice: si nascondono `[^` e `]:` e resta l'etichetta.
  // Con il cursore dentro la definizione si vede il codice, per poterlo modificare.
  addProseMirrorPlugins() {
    const marker = /^\[\^([^\]\s]+)\]:[ \t]?/
    return [
      new Plugin({ key: new PluginKey('owFootnoteSync'), appendTransaction: syncFootnotes }),
      new Plugin({
        key: new PluginKey('owFootnoteDefinitions'),
        props: {
          decorations(state) {
            const decorations = []
            const { from, to } = state.selection
            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'footnoteDefinition') return node.isBlock ? undefined : false
              const found = marker.exec(node.textContent)
              if (found && !(from >= pos && to <= pos + node.nodeSize)) {
                const start = pos + 1
                const labelEnd = start + 2 + found[1].length
                decorations.push(
                  Decoration.inline(start, start + 2, { class: 'ow-footnote-syntax' }),
                  Decoration.inline(start + 2, labelEnd, { class: 'ow-footnote-label' }),
                  Decoration.inline(labelEnd, start + found[0].length, { class: 'ow-footnote-syntax' }),
                )
              }
              return false
            })
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },

  markdownTokenName: 'footnoteDefinition',
  markdownTokenizer: {
    name: 'footnoteDefinition',
    level: 'block',
    start: (src) => src.search(/(?:^|\n)\[\^[^\]\s]+\]:/),
    tokenize(src) {
      // `start` può indicare l'a capo che precede la definizione.
      const offset = src.startsWith('\n') ? 1 : 0
      const match = DEFINITION.exec(src.slice(offset))
      return match ? { type: 'footnoteDefinition', raw: src.slice(0, offset + match[0].length), text: match[0].replace(/\s+$/, '') } : undefined
    },
  },
  parseMarkdown: (token) => ({ type: 'footnoteDefinition', content: token.text ? [{ type: 'text', text: token.text }] : [] }),
  renderMarkdown: (node) => rawText(node),
})
