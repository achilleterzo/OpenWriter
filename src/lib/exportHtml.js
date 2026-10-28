import { anchorIds } from './rawMarkdownExtensions.js'
import { headingSlug } from './bookmarkLinks.js'

/**
 * L'HTML del documento per PDF, stampa e DOCX. Le ancore dell'editor (`<a id="nome"></a>`, che nell'editor sono un'icona) tornano ad essere ancore vere e
 * invisibili: i link `#nome` del documento diventano collegamenti interni del PDF. Anche i titoli prendono l'id che GitHub darebbe loro
 * (minuscolo, trattini; -1, -2 se si ripete), così funzionano anche i link `#titolo`.
 */
export function exportableHtml(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html')
  const used = new Set()
  for (const element of doc.querySelectorAll('[data-html-anchor], [data-html-inline]')) {
    const block = element.hasAttribute('data-html-anchor')
    const ids = anchorIds(element.getAttribute(block ? 'data-html-anchor' : 'data-html-inline'))
    if (!ids.length) { if (block) element.remove(); continue }
    element.replaceWith(...ids.map((id) => { used.add(id); const anchor = doc.createElement('a'); anchor.id = id; return anchor }))
  }
  for (const heading of doc.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    if (heading.id) continue
    const base = headingSlug(heading.textContent)
    if (!base) continue
    let id = base
    for (let number = 1; used.has(id); number += 1) id = `${base}-${number}`
    used.add(id)
    heading.id = id
  }
  return doc.body.innerHTML
}
