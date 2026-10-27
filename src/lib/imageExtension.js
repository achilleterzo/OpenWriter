import Image from '@tiptap/extension-image'
import { mergeAttributes } from '@tiptap/core'
import { markdownLinkText, markdownTarget } from './markdownSyntax.js'


// Un documento con centinaia di immagini non può tenerle tutte decodificate in memoria: ognuna si carica solo quando è vicina alla parte visibile
// e, uscita di vista, si scarica (si rimette un pixel trasparente); lo spazio che occupava resta riservato con le sue proporzioni, quindi il testo non salta.
// Prima della prima misura si riserva un'altezza di ripiego, così le immagini non ancora caricate non collassano e non risultano tutte "in vista".
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
const PRELOAD_MARGIN = '1500px 0px'
const FALLBACK_HEIGHT = '240px'
const naturalSizes = new Map() // indirizzo → { width, height }, per riservare lo spazio anche a immagini ricreate

const lazyImages = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
  for (const entry of entries) entry.target.__lazy?.(entry.isIntersecting)
}, { rootMargin: PRELOAD_MARGIN })

function lazyImage(initialSrc) {
  const image = document.createElement('img')
  let source = initialSrc
  let wanted = false
  image.decoding = 'async'
  image.__lazy = (visible) => { wanted = visible; if (visible) show(); else hide() }

  const reserve = (size) => {
    image.style.width = `${size.width}px`
    image.style.aspectRatio = `${size.width} / ${size.height}`
    image.style.minHeight = ''
  }
  function show() {
    if (!source || image.dataset.state === 'loaded' || (image.dataset.state === 'loading' && image.getAttribute('src') === source)) return
    image.dataset.state = 'loading'
    image.src = source
  }
  function hide() {
    if (!source || image.dataset.state === 'idle' || !image.dataset.state) return
    // Si scarica solo ciò che si conosce già (dimensioni note): altrimenti lo spazio non si saprebbe riservare.
    const size = naturalSizes.get(source)
    if (!size) return
    reserve(size)
    image.dataset.state = 'idle'
    image.src = BLANK
  }
  image.addEventListener('load', () => {
    if (image.src === BLANK || !image.naturalWidth) return
    naturalSizes.set(source, { width: image.naturalWidth, height: image.naturalHeight })
    reserve(naturalSizes.get(source))
    image.dataset.state = 'loaded'
    if (!wanted) hide()
  })
  image.addEventListener('error', () => { image.dataset.state = 'error'; image.style.minHeight = '' })

  const known = source && naturalSizes.get(source)
  if (known) reserve(known); else image.style.minHeight = FALLBACK_HEIGHT
  image.dataset.realSrc = source || ''
  image.src = BLANK
  image.dataset.state = 'idle'
  lazyImages?.observe(image)
  if (!lazyImages) { wanted = true; show() }

  return {
    image,
    setSource(next) {
      if (next === source) return
      source = next
      image.dataset.realSrc = next || ''
      const size = next && naturalSizes.get(next)
      if (size) reserve(size); else { image.style.width = ''; image.style.aspectRatio = ''; image.style.minHeight = FALLBACK_HEIGHT }
      image.dataset.state = 'idle'
      image.src = BLANK
      if (wanted || !lazyImages) show()
    },
    destroy() { lazyImages?.unobserve(image); image.__lazy = null },
  }
}

// Il documento conserva il `src` così come sta nel Markdown (relativo o file:///); nel DOM si mette l'indirizzo caricabile.
export const DocumentImage = Image.extend({
  addOptions() {
    return { ...this.parent?.(), resolveSource: (src) => src }
  },

  // Immagine dentro un link, `[![testo](img.png)](https://…)`: il link è un attributo dell'immagine (un'immagine a blocchi non può portare il marchio "link").
  addAttributes() {
    return {
      ...this.parent?.(),
      href: { default: null, parseHTML: (element) => element.getAttribute('data-href'), renderHTML: (attributes) => (attributes.href ? { 'data-href': attributes.href } : {}) },
      linkTitle: { default: null, parseHTML: (element) => element.getAttribute('data-link-title'), renderHTML: (attributes) => (attributes.linkTitle ? { 'data-link-title': attributes.linkTitle } : {}) },
    }
  },

  renderMarkdown(node) {
    const { src = '', alt = '', title = '', href = null, linkTitle = null } = node.attrs || {}
    // Destinazioni, testo alternativo e titoli passano da markdownSyntax.js: protetti `[` `]` `\` `<` `>` e le virgolette.
    const image = `![${markdownLinkText(alt)}](${markdownTarget(src, title)})`
    if (!href) return image
    return `[${image}](${markdownTarget(href, linkTitle)})`
  },

  // Nell'editor l'immagine è una vista con caricamento pigro (vedi sopra); renderHTML resta quello per l'HTML esportato, copiato o stampato.
  addNodeView() {
    return ({ node }) => {
      const resolve = (attrs) => this.options.resolveSource(attrs.src)
      const lazy = lazyImage(resolve(node.attrs))
      const apply = (attrs) => {
        lazy.image.alt = attrs.alt || ''
        if (attrs.title) lazy.image.title = attrs.title; else lazy.image.removeAttribute('title')
        if (attrs.href) lazy.image.setAttribute('data-href', attrs.href); else lazy.image.removeAttribute('data-href')
        if (attrs.linkTitle) lazy.image.setAttribute('data-link-title', attrs.linkTitle); else lazy.image.removeAttribute('data-link-title')
      }
      apply(node.attrs)
      return {
        dom: lazy.image,
        update(updated) {
          if (updated.type !== node.type) return false
          apply(updated.attrs)
          lazy.setSource(resolve(updated.attrs))
          return true
        },
        // Cambiare src/stile dell'immagine non è una modifica del documento: l'editor non deve rileggere il DOM.
        ignoreMutation: () => true,
        destroy: lazy.destroy,
      }
    }
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(this.options.HTMLAttributes, { ...HTMLAttributes, src: this.options.resolveSource(HTMLAttributes.src) })]
  },
})
