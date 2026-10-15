import Blockquote from '@tiptap/extension-blockquote'

/**
 * Avvisi di GitHub: una citazione la cui prima riga è `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` o `[!CAUTION]`.
 * Nell'editor è una citazione con un'etichetta colorata; nel file resta nella forma di GitHub. Senza questa estensione il `[!NOTE]`
 * veniva scritto `\[!NOTE\]` e l'avviso non funzionava più.
 */
export const ALERT_TYPES = ['NOTE', 'TIP', 'IMPORTANT', 'WARNING', 'CAUTION']
const ALERT_START = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)/i

// Toglie dai token in linea di un paragrafo i primi `length` caratteri (la riga `[!NOTE]`). Restituisce null se non si può farlo in modo sicuro.
function dropPrefix(tokens, length) {
  const rest = []
  let left = length
  for (const token of tokens) {
    if (left <= 0) { rest.push(token); continue }
    const raw = String(token.raw ?? token.text ?? '')
    if (raw.length <= left) { left -= raw.length; continue }
    if (token.type !== 'text' || typeof token.text !== 'string' || token.raw !== token.text) return null
    const text = token.text.slice(left)
    rest.push({ ...token, raw: text, text })
    left = 0
  }
  return left > 0 ? null : rest
}

export const AlertBlockquote = Blockquote.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      alert: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-alert'),
        renderHTML: (attributes) => (attributes.alert ? { 'data-alert': attributes.alert } : {}),
      },
    }
  },

  parseMarkdown(token, helpers) {
    const parseBlockChildren = helpers.parseBlockChildren ?? helpers.parseChildren
    const tokens = token.tokens || []
    const first = tokens[0]
    const match = first?.type === 'paragraph' ? ALERT_START.exec(String(first.text ?? '')) : null
    if (match) {
      const inline = dropPrefix(first.tokens || [], match[0].length)
      if (inline) {
        const rest = inline.length ? [{ ...first, tokens: inline, text: String(first.text).slice(match[0].length), raw: String(first.raw ?? '') }, ...tokens.slice(1)] : tokens.slice(1)
        const children = rest.length ? parseBlockChildren(rest) : [{ type: 'paragraph', content: [] }]
        return helpers.createNode('blockquote', { alert: match[1].toUpperCase() }, children)
      }
    }
    return helpers.createNode('blockquote', undefined, parseBlockChildren(tokens))
  },

  renderMarkdown(node, helpers) {
    if (!node.content) return ''
    const lines = node.attrs?.alert ? [`> [!${node.attrs.alert}]`] : []
    let written = 0
    node.content.forEach((child, index) => {
      const rendered = helpers.renderChild?.(child, index) ?? helpers.renderChildren([child])
      // Un avviso senza testo ha un solo paragrafo vuoto: non si scrive.
      if (node.attrs?.alert && node.content.length === 1 && !rendered.trim()) return
      if (written) lines.push('>')
      lines.push(...rendered.split('\n').map((line) => (line.trim() === '' ? '>' : `> ${line}`)))
      written += 1
    })
    return lines.join('\n')
  },
})
