import { Node } from '@tiptap/core'

/**
 * Note a piè di pagina del Markdown esteso: il richiamo `[^id]` nel testo e la definizione `[^id]: testo` (anche su più righe rientrate).
 * Non si numerano né si collegano: restano com'erano scritti, riscritti identici al salvataggio. Senza queste estensioni `[^1]` veniva scritto `\[^1\]`
 * e la definizione veniva scambiata per una definizione di link, fondendola nel testo.
 */
const rawText = (node) => (node.content || []).map((child) => child.text || '').join('')

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
