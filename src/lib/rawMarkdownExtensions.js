import { Node } from '@tiptap/core'

/**
 * Parti del Markdown che l'editor non sa rappresentare ma che non devono andare perse né essere alterate al salvataggio:
 * il front matter YAML in testa al file, l'HTML in blocco e i tag HTML in linea. Restano testo grezzo, riscritto identico.
 */
const rawText = (node) => (node.content || []).map((child) => child.text || '').join('')

// Blocco `---` … `---` all'inizio del documento. La prima riga deve somigliare a YAML (chiave: valore o commento),
// così un `---` iniziale seguito da un altro `---` più avanti resta una linea orizzontale.
const FRONT_MATTER = /^---[ \t]*\r?\n((?:[^\n]*\n)*?)(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/

export const FrontMatter = Node.create({
  name: 'frontMatter',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,
  isolating: true,

  parseHTML() { return [{ tag: 'pre[data-front-matter]', preserveWhitespace: 'full' }] },
  renderHTML() { return ['pre', { 'data-front-matter': '', class: 'ow-raw-block' }, 0] },

  markdownTokenName: 'frontMatter',
  markdownTokenizer: {
    name: 'frontMatter',
    level: 'block',
    start: (src) => (src.startsWith('---') ? 0 : -1),
    tokenize(src, tokens) {
      if (tokens.length) return undefined
      const match = FRONT_MATTER.exec(src)
      if (!match || !/^\s*(#|[\w"'.-][^:\n]*:)/.test(match[1])) return undefined
      return { type: 'frontMatter', raw: match[0], text: match[1].replace(/\r?\n$/, '') }
    },
  },
  parseMarkdown: (token) => ({ type: 'frontMatter', content: token.text ? [{ type: 'text', text: token.text }] : [] }),
  renderMarkdown: (node) => `---\n${rawText(node)}\n---`,
})

// HTML in blocco (`<div>`, commenti `<!-- -->`…): marked lo riconosce già come token "html".
export const HtmlBlock = Node.create({
  name: 'htmlBlock',
  group: 'block',
  content: 'text*',
  marks: '',
  code: true,
  defining: true,

  parseHTML() { return [{ tag: 'pre[data-html-block]', preserveWhitespace: 'full' }] },
  renderHTML() { return ['pre', { 'data-html-block': '', class: 'ow-raw-block' }, 0] },

  markdownTokenName: 'html',
  parseMarkdown(token) {
    if (!token.block) return null
    const text = String(token.raw ?? token.text ?? '').replace(/\s+$/, '')
    return text ? { type: 'htmlBlock', content: [{ type: 'text', text }] } : null
  },
  renderMarkdown: (node) => rawText(node),
})

// Tag HTML in mezzo al testo (`<span>`, `</span>`, `<br>`, `<!-- -->`): ognuno è un elemento indivisibile che mostra il tag.
export const HtmlInline = Node.create({
  name: 'htmlInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return { html: { default: '', parseHTML: (element) => element.getAttribute('data-html-inline') || '' } }
  },
  parseHTML() { return [{ tag: 'span[data-html-inline]' }] },
  renderHTML({ node }) { return ['span', { 'data-html-inline': node.attrs.html, class: 'ow-html-inline' }, node.attrs.html] },

  markdownTokenName: 'htmlInline',
  markdownTokenizer: {
    name: 'htmlInline',
    level: 'inline',
    start: (src) => src.search(/<(?:!--|\/?[a-zA-Z])/),
    tokenize(src) {
      const match = /^(?:<!--[\s\S]*?-->|<\/?[a-zA-Z][\w-]*(?:\s[^<>]*)?\/?>)/.exec(src)
      return match ? { type: 'htmlInline', raw: match[0], text: match[0] } : undefined
    },
  },
  parseMarkdown: (token) => ({ type: 'htmlInline', attrs: { html: token.raw } }),
  renderMarkdown: (node) => node.attrs.html,
})
