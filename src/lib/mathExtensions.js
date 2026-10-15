import { Node } from '@tiptap/core'

/**
 * Formule LaTeX del Markdown esteso: `$…$` nel testo e `$$…$$` (anche su più righe) in blocco.
 * Non si disegnano: restano testo grezzo, riscritto identico al salvataggio. Senza queste estensioni i `_` e `*` della formula
 * erano letti come corsivo e scritti `\_`, cambiando la formula.
 */
const rawText = (node) => (node.content || []).map((child) => child.text || '').join('')

// `$` di apertura seguito da un carattere non spazio, `$` di chiusura preceduto da un non spazio e non seguito da una cifra:
// così "costa $5 e $10" non è una formula.
const INLINE = /^\$(?!\s)(?:\\.|[^$\n\\])+?(?<![\s\\])\$(?!\d)/

export const MathInline = Node.create({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { source: { default: '', parseHTML: (element) => element.getAttribute('data-math-inline') || '' } }
  },
  parseHTML() { return [{ tag: 'span[data-math-inline]' }] },
  renderHTML({ node }) { return ['span', { 'data-math-inline': node.attrs.source, class: 'ow-math' }, node.attrs.source] },

  markdownTokenName: 'mathInline',
  markdownTokenizer: {
    name: 'mathInline',
    level: 'inline',
    start: (src) => src.indexOf('$'),
    tokenize(src) {
      const match = INLINE.exec(src)
      return match ? { type: 'mathInline', raw: match[0], source: match[0] } : undefined
    },
  },
  parseMarkdown: (token) => ({ type: 'mathInline', attrs: { source: token.source } }),
  renderMarkdown: (node) => node.attrs.source,
})

// `$$` su una riga (`$$ x $$`) oppure `$$` / formula / `$$` su più righe.
const BLOCK = /^\$\$(?:[ \t]*\n[\s\S]*?\n[ \t]*\$\$|[^\n]*?\$\$)[ \t]*(?:\n|$)/

export const MathBlock = Node.create({
  name: 'mathBlock',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,

  parseHTML() { return [{ tag: 'pre[data-math-block]', preserveWhitespace: 'full' }] },
  renderHTML() { return ['pre', { 'data-math-block': '', class: 'ow-raw-block ow-math-block' }, 0] },

  markdownTokenName: 'mathBlock',
  markdownTokenizer: {
    name: 'mathBlock',
    level: 'block',
    start: (src) => src.search(/(?:^|\n)\$\$/),
    tokenize(src) {
      const offset = src.startsWith('\n') ? 1 : 0
      const match = BLOCK.exec(src.slice(offset))
      return match ? { type: 'mathBlock', raw: src.slice(0, offset + match[0].length), text: match[0].replace(/\s+$/, '') } : undefined
    },
  },
  parseMarkdown: (token) => ({ type: 'mathBlock', content: token.text ? [{ type: 'text', text: token.text }] : [] }),
  renderMarkdown: (node) => rawText(node),
})
