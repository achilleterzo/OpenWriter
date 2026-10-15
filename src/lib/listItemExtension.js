import { ListItem } from '@tiptap/extension-list'

/**
 * Elemento di lista che, scrivendo il Markdown, rientra il contenuto annidato quanto è largo il suo segno ("- " = 2, "1. " = 3, "10. " = 4).
 * L'elemento predefinito rientra sempre di 2 spazi: sotto "1. " il sotto-elenco non era più annidato per CommonMark (serve almeno la larghezza del segno),
 * e altri programmi (GitHub…) lo mostravano come una lista a parte.
 */
function marker(context) {
  if (context.parentType === 'orderedList') {
    const start = context.meta?.parentAttrs?.start || 1
    return `${start + (context.index || 0)}. `
  }
  return '- '
}

export const MarkdownListItem = ListItem.extend({
  renderMarkdown(node, helpers, context) {
    if (!node || !Array.isArray(node.content)) return ''
    const prefix = marker(context || {})
    const pad = ' '.repeat(prefix.length)
    const [first, ...children] = node.content
    let output = `${prefix}${helpers.renderChildren([first])}`
    children.forEach((child, index) => {
      const rendered = helpers.renderChild?.(child, index + 1) ?? helpers.renderChildren([child])
      if (rendered === undefined || rendered === null) return
      const lines = rendered.split('\n').map((line) => (line ? `${pad}${line}` : ''))
      // Un paragrafo dopo il primo è separato da una riga vuota; una lista annidata segue subito.
      output += `${child.type === 'paragraph' ? '\n\n' : '\n'}${lines.join('\n')}`
    })
    return output
  },
})
