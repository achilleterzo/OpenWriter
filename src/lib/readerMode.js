import { Readability } from '@mozilla/readability'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

// Estrae l'articolo da una pagina web (stesso algoritmo della Reader View di Firefox).
// `html` è il documento della pagina, `url` il suo indirizzo (serve a rendere assoluti i collegamenti e le immagini).
export function extractArticle(html, url) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const base = doc.createElement('base')
  base.href = url
  doc.head.prepend(base)
  const article = new Readability(doc).parse()
  if (!article || !article.content?.trim()) return null
  return { title: (article.title || '').trim(), byline: (article.byline || '').trim(), siteName: (article.siteName || '').trim(), content: article.content, url }
}

// Pagina della vista lettura. Va in un iframe con `sandbox` vuoto: il contenuto viene dal web e non può eseguire script.
export function readerDocument(article, { dark, size }) {
  const escape = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const colors = dark ? { background: '#18181a', text: '#d9d9de', muted: '#8d8d96', link: '#8ab4f8', rule: '#34343a' } : { background: '#f4f4f2', text: '#222225', muted: '#6b6b6b', link: '#1a5fb4', rule: '#d4d4d0' }
  return `<!doctype html><html><head><meta charset="utf-8"><base href="${escape(article.url)}" target="_blank"><meta name="referrer" content="no-referrer"><style>
    body{margin:0;background:${colors.background};color:${colors.text};font:${size}px/1.7 Georgia,'Times New Roman',serif}
    main{max-width:42rem;margin:0 auto;padding:2rem 1.25rem 4rem}
    h1,h2,h3,h4{line-height:1.25;font-family:system-ui,sans-serif}
    h1{font-size:1.9em;margin:0 0 .25em}
    .meta{color:${colors.muted};font:.8em system-ui,sans-serif;margin:0 0 2em;padding-bottom:1em;border-bottom:1px solid ${colors.rule}}
    a{color:${colors.link}} img,video{max-width:100%;height:auto} figure{margin:1.5em 0} figcaption{color:${colors.muted};font-size:.8em}
    pre,code{font-family:ui-monospace,Consolas,monospace;font-size:.88em} pre{overflow:auto;padding:.8em;border:1px solid ${colors.rule};border-radius:6px}
    blockquote{margin:1.2em 0;padding-left:1em;border-left:3px solid ${colors.rule};color:${colors.muted}} table{border-collapse:collapse} td,th{border:1px solid ${colors.rule};padding:.3em .6em}
  </style></head><body><main><h1>${escape(article.title)}</h1><p class="meta">${[article.byline, article.siteName, new URL(article.url).hostname].filter(Boolean).map(escape).join(' · ')}</p>${article.content}</main></body></html>`
}

// Articolo in Markdown, con titolo e fonte in testa.
export function articleToMarkdown(article, { sourceLabel }) {
  const service = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced', emDelimiter: '*' })
  service.use(gfm)
  service.remove(['script', 'style', 'iframe'])
  const body = service.turndown(article.content).trim()
  const meta = [article.byline, article.siteName].filter(Boolean).join(' · ')
  return `# ${article.title || new URL(article.url).hostname}\n\n${meta ? `${meta}\n\n` : ''}> ${sourceLabel}: <${article.url}>\n\n${body}\n`
}

// Nome di file sicuro ricavato dal titolo.
export function articleFileName(article) {
  const name = (article.title || new URL(article.url).hostname).replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80).trim()
  return name || 'article'
}
