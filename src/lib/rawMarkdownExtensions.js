import { Node } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'

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

// Ancore HTML (`<a id="nome"></a>`, anche `name=`): servono solo da bersaglio dei link `#nome`. Sono "ancore pure" quando il blocco HTML è fatto soltanto di esse.
// Non si mostrano come codice ma come un'etichetta tenue `#nome`; il testo originale si riscrive identico.
const ANCHOR_SOURCE = '<a\\s+(?:id|name)\\s*=\\s*"([^"]+)"\\s*>\\s*</a>'
const ONLY_ANCHORS = new RegExp(`^(?:${ANCHOR_SOURCE}\\s*)+$`)
const ANCHOR_PAIR = new RegExp(`^${ANCHOR_SOURCE}$`)
const anchorNames = (raw) => Array.from(String(raw).matchAll(new RegExp(ANCHOR_SOURCE, 'g')), (match) => match[1])

// Nomi delle ancore di un testo (`<a id="a"></a>\n<a name="b"></a>` → ['a', 'b']) e il testo che le riscrive: una per riga.
export const anchorIds = (raw) => anchorNames(raw)
export const anchorRaw = (ids) => ids.map((id) => `<a id="${id}"></a>`).join('\n')
export const isAnchorHtml = (html) => ANCHOR_PAIR.test(String(html || ''))
// "Ancora sul titolo!" → "ancora-sul-titolo": minuscole, senza accenti, il resto in trattini.
export const slugify = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '')

// Tutte le ancore del documento, nell'ordine: { id, pos, kind: 'block' | 'inline', text }. `text` è ciò a cui si riferiscono: il blocco che segue le ancore, o quello che le contiene.
export function collectAnchors(doc) {
  const found = []
  const following = (index, parent) => {
    for (let next = index + 1; next < parent.childCount; next += 1) {
      const sibling = parent.child(next)
      if (sibling.type.name !== 'htmlAnchor' && sibling.textContent.trim()) return sibling.textContent.trim()
    }
    return ''
  }
  doc.descendants((node, pos, parent, index) => {
    if (node.type.name === 'htmlAnchor') {
      const text = following(index, parent)
      for (const id of anchorNames(node.attrs.raw)) found.push({ id, pos, kind: 'block', text })
    } else if (node.type.name === 'htmlInline' && ANCHOR_PAIR.test(node.attrs.html)) {
      found.push({ id: ANCHOR_PAIR.exec(node.attrs.html)[1], pos, kind: 'inline', text: parent.textContent.replace(/\s+/g, ' ').trim() })
    }
    return true
  })
  return found
}

export const HtmlAnchor = Node.create({
  name: 'htmlAnchor',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return { raw: { default: '', parseHTML: (element) => element.getAttribute('data-html-anchor') || '' } }
  },
  parseHTML() { return [{ tag: 'div[data-html-anchor]' }] },
  addCommands() {
    return {
      // Inserisce un'ancora prima del blocco del cursore, con un nome ricavato dal suo testo (unico nel documento), e la seleziona: la barra mobile permette di cambiarlo.
      insertAnchor: () => ({ state, tr, dispatch }) => {
        const { selection, doc, schema } = state
        const type = schema.nodes.htmlAnchor
        if (!type) return false
        const top = selection.$from.depth ? selection.$from.before(1) : selection.from
        const block = doc.nodeAt(top)
        const used = new Set(collectAnchors(doc).map((item) => item.id))
        const base = slugify(block?.type.name === 'htmlAnchor' ? '' : block?.textContent) || 'ancora'
        let id = base
        for (let number = 2; used.has(id); number += 1) id = `${base}-${number}`
        if (dispatch) {
          tr.insert(top, type.create({ raw: anchorRaw([id]) }))
          tr.setSelection(NodeSelection.create(tr.doc, top)).scrollIntoView()
          dispatch(tr)
        }
        return true
      },
    }
  },
  // Solo l'icona (la disegna il CSS); i nomi si leggono nel suggerimento e, a ancora selezionata, nella barra mobile.
  renderHTML({ node }) {
    const label = anchorNames(node.attrs.raw).map((name) => `#${name}`).join(' ')
    return ['div', { 'data-html-anchor': node.attrs.raw, class: 'ow-anchor', title: label, 'aria-label': label }]
  },
  // Una riga fatta solo di ancore NON è un blocco HTML per CommonMark (dopo il tag di apertura c'è `</a>`): sarebbe un paragrafo di tag in linea, quindi serve un tokenizzatore di blocco.
  markdownTokenName: 'htmlAnchor',
  markdownTokenizer: {
    name: 'htmlAnchor',
    level: 'block',
    start(src) {
      const found = /(^|\n)(?=<a\s+(?:id|name)\s*=)/.exec(src)
      return found ? found.index + found[1].length : -1
    },
    tokenize(src) {
      const match = new RegExp(`^(?:${ANCHOR_SOURCE}[ \\t]*(?:\\r?\\n|$))+`).exec(src)
      return match ? { type: 'htmlAnchor', raw: match[0], text: match[0].replace(/\s+$/, '') } : undefined
    },
  },
  parseMarkdown: (token) => ({ type: 'htmlAnchor', attrs: { raw: token.text } }),
  renderMarkdown: (node) => node.attrs.raw,
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
    if (ONLY_ANCHORS.test(text)) return { type: 'htmlAnchor', attrs: { raw: text } }
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
  renderHTML({ node }) {
    const anchor = ANCHOR_PAIR.exec(node.attrs.html)
    return anchor ? ['span', { 'data-html-inline': node.attrs.html, class: 'ow-html-inline ow-anchor-inline', title: `#${anchor[1]}`, 'aria-label': `#${anchor[1]}` }] : ['span', { 'data-html-inline': node.attrs.html, class: 'ow-html-inline' }, node.attrs.html]
  },

  markdownTokenName: 'htmlInline',
  markdownTokenizer: {
    name: 'htmlInline',
    level: 'inline',
    start: (src) => src.search(/<(?:!--|\/?[a-zA-Z])/),
    tokenize(src) {
      const pair = new RegExp(`^${ANCHOR_SOURCE}`).exec(src)
      if (pair) return { type: 'htmlInline', raw: pair[0], text: pair[0] }
      const match = /^(?:<!--[\s\S]*?-->|<\/?[a-zA-Z][\w-]*(?:\s[^<>]*)?\/?>)/.exec(src)
      return match ? { type: 'htmlInline', raw: match[0], text: match[0] } : undefined
    },
  },
  parseMarkdown: (token) => ({ type: 'htmlInline', attrs: { html: token.raw } }),
  renderMarkdown: (node) => node.attrs.html,
})
