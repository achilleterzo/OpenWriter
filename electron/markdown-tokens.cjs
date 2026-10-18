const { Marked } = require('marked')

/**
 * Analizzatore Markdown del processo principale, con le stesse estensioni dell'editor (front matter, note a piè di pagina, formule): così, quando si
 * cerca un'immagine o si calcola il testo piano, ciò che è "codice", "formula" o "nota" è deciso come lo decide l'editor, e non da espressioni
 * regolari applicate al sorgente (che tocchino anche gli esempi dentro un blocco di codice).
 *
 * Le espressioni qui sotto rispecchiano quelle dell'editor: src/lib/rawMarkdownExtensions.js (front matter), footnoteExtensions.js e
 * mathExtensions.js. Vanno tenute allineate (c'è una prova che confronta il testo piano con quello dell'editor).
 */
const FRONT_MATTER = /^---[ \t]*\r?\n((?:[^\n]*\n)*?)(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/
const FRONT_MATTER_BODY = /^\s*(#|[\w"'.-][^:\n]*:)/
const FOOTNOTE_REF = /^\[\^([^\]\s]+)\](?!:)/
const FOOTNOTE_DEFINITION = /^\[\^([^\]\s]+)\]:[^\n]*(?:\n(?:[ \t]*\n)*[ \t]+\S[^\n]*)*(?:\n|$)/
const MATH_INLINE = /^\$(?!\s)(?:\\.|[^$\n\\])+?(?<![\s\\])\$(?!\d)/
const MATH_BLOCK = /^\$\$(?:[ \t]*\n[\s\S]*?\n[ \t]*\$\$|[^\n]*?\$\$)[ \t]*(?:\n|$)/

const extensions = [
  {
    name: 'frontMatter',
    level: 'block',
    start: (src) => (src.startsWith('---') ? 0 : -1),
    tokenizer(src, tokens) {
      // Solo all'inizio del documento, e solo se il contenuto sembra davvero un front matter (non un'ordinaria linea orizzontale tra due paragrafi).
      if (tokens.length) return undefined
      const match = FRONT_MATTER.exec(src)
      if (!match || !FRONT_MATTER_BODY.test(match[1])) return undefined
      return { type: 'frontMatter', raw: match[0], text: match[1].replace(/\r?\n$/, '') }
    },
  },
  {
    name: 'footnoteDefinition',
    level: 'block',
    start: (src) => src.search(/(?:^|\n)\[\^[^\]\s]+\]:/),
    tokenizer(src) {
      const offset = src.startsWith('\n') ? 1 : 0
      const match = FOOTNOTE_DEFINITION.exec(src.slice(offset))
      return match ? { type: 'footnoteDefinition', raw: src.slice(0, offset + match[0].length), text: match[0].replace(/\s+$/, '') } : undefined
    },
  },
  {
    name: 'mathBlock',
    level: 'block',
    start: (src) => src.search(/(?:^|\n)\$\$/),
    tokenizer(src) {
      const offset = src.startsWith('\n') ? 1 : 0
      const match = MATH_BLOCK.exec(src.slice(offset))
      return match ? { type: 'mathBlock', raw: src.slice(0, offset + match[0].length), text: match[0].replace(/\s+$/, '') } : undefined
    },
  },
  {
    name: 'footnoteRef',
    level: 'inline',
    start: (src) => src.indexOf('[^'),
    tokenizer(src) {
      const match = FOOTNOTE_REF.exec(src)
      return match ? { type: 'footnoteRef', raw: match[0] } : undefined
    },
  },
  {
    name: 'mathInline',
    level: 'inline',
    start: (src) => src.indexOf('$'),
    tokenizer(src) {
      const match = MATH_INLINE.exec(src)
      return match ? { type: 'mathInline', raw: match[0] } : undefined
    },
  },
]

const parser = new Marked()
parser.use({ extensions })

// Il sorgente si normalizza come fa marked (a capo \n): gli indici dei token valgono per il testo restituito.
const normalizeNewlines = (markdown) => String(markdown ?? '').replace(/\r\n?/g, '\n')

function lex(markdown) {
  const source = normalizeNewlines(markdown)
  return { source, tokens: parser.lexer(source) }
}

module.exports = { lex, normalizeNewlines }
