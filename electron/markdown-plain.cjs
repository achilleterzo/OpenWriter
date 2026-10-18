const { lex } = require('./markdown-tokens.cjs')

/**
 * Testo piano di un documento Markdown, come lo vede l'editor di OpenWriter: blocchi separati da "\n", senza i simboli del Markdown
 * (asterischi, marcatori di elenco, #, link ridotti al loro testo, immagini assenti). Le note si ancorano a questo testo (vedi src/lib/anchoring.js),
 * quindi una citazione data come testo piano si ritrova nell'editor.
 *
 * Il testo segue la semantica dell'editor, non quella di un puro convertitore Markdown: i richiami di nota e le formule in linea sono elementi senza
 * testo (non compaiono); formule in blocco, definizioni di nota, front matter (solo se valido) e blocchi HTML sono testo grezzo (compaiono come
 * sono scritti). Il riconoscimento passa da markdown-tokens.cjs, con le stesse regole dell'editor: `[^1]` dentro un blocco di codice o tra apici
 * inversi resta testo.
 */
const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&nbsp;': ' ' }
const unescapeHtml = (value) => String(value ?? '').replace(/&(?:amp|lt|gt|quot|#39|#x27|nbsp);/g, (entity) => ENTITIES[entity])

// Nell'editor un'immagine è un blocco a sé: spezza il paragrafo che la contiene, e tra il testo prima e quello dopo c'è un a capo.
// Dentro `inline` la si segna con questo carattere, che poi separa i pezzi (vedi pieces).
const IMAGE_BREAK = '\u0000'
const pieces = (value) => value.split(IMAGE_BREAK)

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
      case 'image':
        return IMAGE_BREAK
      default: // br, html in linea, richiamo di nota, formula in linea: nessun testo
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
        out.push(...pieces(token.tokens ? inline(token.tokens) : unescapeHtml(token.text)))
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
        for (const cell of token.header) out.push(...pieces(inline(cell.tokens)))
        for (const row of token.rows) for (const cell of row) out.push(...pieces(inline(cell.tokens)))
        break
      case 'html':
        out.push(String(token.text ?? token.raw).trim())
        break
      case 'frontMatter':
      case 'footnoteDefinition':
      case 'mathBlock':
        out.push(token.text)
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
  const { tokens } = lex(markdown)
  let plain = ''
  const list = []
  for (const token of tokens) {
    const pieces = []
    blocks([token], pieces)
    const filtered = pieces.filter((piece) => piece !== '')
    if (!filtered.length) continue
    if (plain) plain += '\n'
    const text = filtered.join('\n')
    list.push({ type: token.type, raw: token.raw.replace(/^\n+/, '').replace(/\n+$/, ''), start: plain.length, end: plain.length + text.length })
    plain += text
  }
  return { plain, blocks: list }
}

const markdownToPlain = (markdown) => analyzeMarkdown(markdown).plain

module.exports = { markdownToPlain, analyzeMarkdown }
