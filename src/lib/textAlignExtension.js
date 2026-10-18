import { Extension } from '@tiptap/core'
import Heading from '@tiptap/extension-heading'
import Paragraph from '@tiptap/extension-paragraph'

/**
 * Allineamento del testo (sinistra, centro, destra, giustificato) per paragrafi e titoli.
 * Il Markdown non lo prevede: si salva nella forma che GitHub e molti altri renderer capiscono, un blocco HTML con righe vuote attorno,
 * così il testo dentro resta Markdown (grassetto, link…):
 *
 *     <div align="center">
 *
 *     Testo **centrato**
 *
 *     </div>
 *
 * Si leggono anche `<p align="center">…</p>` e `<h2 align="right">…</h2>` (anche con `style="text-align:…"`) e si riscrivono come blocco `<div>`.
 * Tag con altri attributi (class, id…) non si toccano: restano HTML grezzo, riscritto identico.
 */
export const ALIGNMENTS = ['left', 'center', 'right', 'justify']
const isAlignment = (value) => ALIGNMENTS.includes(value)

const wrap = (align, body) => `<div align="${align}">\n\n${body}\n\n</div>`

// Come il Paragraph di tiptap, ma un paragrafo allineato si scrive dentro il blocco <div align>.
export const AlignedParagraph = Paragraph.extend({
  renderMarkdown(node, helpers, context) {
    if (!node) return ''
    const content = Array.isArray(node.content) ? node.content : []
    if (content.length === 0) {
      const previous = context?.previousNode
      const previousIsEmpty = previous?.type === 'paragraph' && !(Array.isArray(previous.content) && previous.content.length)
      return previousIsEmpty ? '&nbsp;' : ''
    }
    const body = helpers.renderChildren(content)
    return isAlignment(node.attrs?.align) ? wrap(node.attrs.align, body) : body
  },
})

export const AlignedHeading = Heading.extend({
  renderMarkdown(node, helpers) {
    if (!node.content) return ''
    const level = node.attrs?.level ? parseInt(node.attrs.level, 10) : 1
    const line = `${'#'.repeat(level)} ${helpers.renderChildren(node.content)}`
    return isAlignment(node.attrs?.align) ? wrap(node.attrs.align, line) : line
  },
})

// Attributo `align` su paragrafi e titoli, comandi e scorciatoie.
export const TextAlign = Extension.create({
  name: 'textAlign',

  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading'],
      attributes: {
        align: {
          default: null,
          parseHTML: (element) => {
            const value = element.getAttribute('data-align') || element.style.textAlign || element.getAttribute('align')
            return isAlignment(value) ? value : null
          },
          renderHTML: (attributes) => (isAlignment(attributes.align) ? { 'data-align': attributes.align, style: `text-align: ${attributes.align}` } : {}),
        },
      },
    }]
  },

  addCommands() {
    // Si allineano i paragrafi e i titoli toccati dalla selezione, ma non quelli che la selezione sfiora soltanto: un triplo clic, per esempio, arriva
    // all'inizio del paragrafo dopo, e una selezione che parte a fine riga comincia nel paragrafo prima. updateAttributes li includeva.
    const apply = (align) => ({ state, tr, dispatch }) => {
      const { doc, selection } = state
      let changed = false
      for (const range of selection.ranges) {
        const from = range.$from.pos
        const to = range.$to.pos
        doc.nodesBetween(from, to, (node, pos) => {
          if (node.type.name !== 'paragraph' && node.type.name !== 'heading') return true
          const start = pos + 1
          const end = pos + node.nodeSize - 1
          const touchesOnly = from !== to && (to <= start || from >= end)
          if (!touchesOnly && (node.attrs.align ?? null) !== align) {
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, align })
            changed = true
          }
          return false
        })
      }
      if (changed && dispatch) dispatch(tr)
      return changed
    }
    return {
      setTextAlign: (align) => (isAlignment(align) ? apply(align === 'left' ? null : align) : () => false),
      unsetTextAlign: () => apply(null),
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Shift-l': () => this.editor.commands.setTextAlign('left'),
      'Mod-Shift-e': () => this.editor.commands.setTextAlign('center'),
      'Mod-Shift-r': () => this.editor.commands.setTextAlign('right'),
      'Mod-Shift-j': () => this.editor.commands.setTextAlign('justify'),
    }
  },
})

// Solo `align="…"` o `style="text-align: …"`, nient'altro: altrimenti il tag resterebbe com'è (HTML grezzo).
const ATTRIBUTES = /^\s+(?:align=["']?(left|center|right|justify)["']?|style=["']\s*text-align:\s*(left|center|right|justify)\s*;?\s*["'])\s*$/i
const alignOf = (attributes) => {
  const match = ATTRIBUTES.exec(attributes)
  return match ? (match[1] || match[2]).toLowerCase() : null
}

const DIV = /^<div(\s[^>]*)>[ \t]*\n(?:[ \t]*\n)*([\s\S]*?)\n[ \t]*<\/div>[ \t]*(?:\n|$)/i
// Senza righe vuote dentro: un blocco HTML finisce alla prima riga vuota.
const INLINE_BLOCK = /^<(p|h[1-6])(\s[^>]*)>((?:(?!\n[ \t]*\n)[\s\S])*?)<\/\1>[ \t]*(?:\n|$)/i

export const AlignedBlocks = Extension.create({
  name: 'alignedBlocks',

  markdownTokenName: 'alignedBlock',
  markdownTokenizer: {
    name: 'alignedBlock',
    level: 'block',
    start: (src) => src.search(/(?:^|\n)<(?:div|p|h[1-6])\s/i),
    tokenize(src, _tokens, lexer) {
      const offset = src.startsWith('\n') ? 1 : 0
      const text = src.slice(offset)
      const block = DIV.exec(text)
      if (block) {
        const align = alignOf(block[1])
        if (align && !/<div[\s>]/i.test(block[2])) {
          const tokens = lexer.blockTokens(block[2])
          // Solo paragrafi e titoli: con altro dentro (liste, tabelle, HTML…) il blocco resta HTML grezzo, riscritto identico, senza perdere l'allineamento.
          if (tokens.every((token) => token.type === 'paragraph' || token.type === 'heading' || token.type === 'space')) {
            return { type: 'alignedBlock', raw: src.slice(0, offset + block[0].length), kind: 'div', align, tokens }
          }
        }
      }
      const inline = INLINE_BLOCK.exec(text)
      if (inline) {
        const align = alignOf(inline[2])
        // Se il contenuto comincia con un tag HTML (es. <img>), scritto fuori dal tag di apertura diventerebbe un blocco HTML a sé: resta grezzo.
        if (align && !/^</.test(inline[3].trim())) {
          const tag = inline[1].toLowerCase()
          return { type: 'alignedBlock', raw: src.slice(0, offset + inline[0].length), kind: tag, align, tokens: lexer.inlineTokens(inline[3].trim()) }
        }
      }
      return undefined
    },
  },

  parseMarkdown(token, helpers) {
    if (token.kind === 'div') {
      const parseBlocks = helpers.parseBlockChildren ?? helpers.parseChildren
      return parseBlocks(token.tokens || []).map((node) => (node.type === 'paragraph' || node.type === 'heading' ? { ...node, attrs: { ...node.attrs, align: token.align } } : node))
    }
    const content = helpers.parseInline(token.tokens || [])
    if (token.kind === 'p') return helpers.createNode('paragraph', { align: token.align }, content)
    return helpers.createNode('heading', { level: Number(token.kind.slice(1)), align: token.align }, content)
  },
})
