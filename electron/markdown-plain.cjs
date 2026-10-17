const { marked } = require('marked')

/**
 * Testo piano di un documento Markdown, come lo vede l'editor di OpenWriter: blocchi separati da "\n", senza i simboli del Markdown
 * (asterischi, marcatori di elenco, #, link ridotti al loro testo, immagini assenti). Le note si ancorano a questo testo (vedi src/lib/anchoring.js),
 * quindi una citazione data come testo piano si ritrova nell'editor.
 */
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&nbsp;': ' ' }
const unescapeHtml = (value) => String(value ?? '').replace(/&(?:amp|lt|gt|quot|#39|#x27|nbsp);/g, (entity) => ENTITIES[entity])

// I richiami di nota a piè di pagina [^1] sono elementi senza testo nell'editor. Marked non li conosce (li scambierebbe per un riferimento a un link):
// durante l'analisi diventano una sequenza privata, che dal testo piano sparisce e nel Markdown originale torna com'era.
const FOOTNOTE_MARK = /\[\^([^\]\s]+)\](?!:)/g
const PRIVATE_MARK = /([^]*)/g
const protectFootnotes = (value) => value.replace(FOOTNOTE_MARK, '$1')
const restoreFootnotes = (value) => value.replace(PRIVATE_MARK, '[^$1]')
const dropFootnotes = (value) => value.replace(PRIVATE_MARK, '')

function inline(tokens) {
  return (tokens || []).map((token) => {
    switch (token.type) {
      case 'text':
      case 'escape':
        return token.tokens ? inline(token.tokens) : unescapeHtml(token.text)
      case 'strong':
      case 'em':
      case 'del':
      case 'link':
        return inline(token.tokens)
      case 'codespan':
        return unescapeHtml(token.text)
      default: // br, image, html in linea: nessun testo
        return ''
    }
  }).join('')
}

function blocks(tokens, out) {
  for (const token of tokens || []) {
    switch (token.type) {
      case 'paragraph':
      case 'heading':
      case 'text':
        out.push(token.tokens ? inline(token.tokens) : unescapeHtml(token.text))
        break
      case 'code':
        out.push(token.text)
        break
      case 'blockquote':
        blocks(token.tokens, out)
        break
      case 'list':
        for (const item of token.items) blocks(item.tokens, out)
        break
      case 'table':
        for (const cell of token.header) out.push(inline(cell.tokens))
        for (const row of token.rows) for (const cell of row) out.push(inline(cell.tokens))
        break
      case 'html':
        out.push(String(token.text ?? token.raw).trim())
        break
      default: // space, hr, def…
        break
    }
  }
}

/**
 * Analisi di un documento: `plain` è il testo piano e `blocks` i blocchi di primo livello con tipo ('paragraph', 'heading', 'list'…),
 * il loro Markdown originale (`raw`) e la posizione `start`–`end` nel testo piano.
 */
function analyzeMarkdown(markdown) {
  const source = protectFootnotes(String(markdown ?? '').replace(/\r\n?/g, '\n')).replace(/^---\n[\s\S]*?\n---[ \t]*(?:\n|$)/, '')
  let plain = ''
  const list = []
  for (const token of marked.lexer(source)) {
    const pieces = []
    blocks([token], pieces)
    const filtered = pieces.map(dropFootnotes).filter((piece) => piece !== '')
    if (!filtered.length) continue
    if (plain) plain += '\n'
    const text = filtered.join('\n')
    list.push({ type: token.type, raw: restoreFootnotes(token.raw).replace(/\n+$/, ''), start: plain.length, end: plain.length + text.length })
    plain += text
  }
  return { plain, blocks: list }
}

const markdownToPlain = (markdown) => analyzeMarkdown(markdown).plain

module.exports = { markdownToPlain, analyzeMarkdown }
