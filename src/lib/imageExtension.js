import Image from '@tiptap/extension-image'
import { mergeAttributes } from '@tiptap/core'

// Destinazione di un link o di un'immagine nel Markdown: con spazi (o parentesi angolari) va tra < >, altrimenti il link si romperebbe.
export const markdownDestination = (value) => (/[\s<>]/.test(String(value)) ? `<${value}>` : String(value))

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
    const image = title ? `![${alt ?? ''}](${markdownDestination(src)} "${title}")` : `![${alt ?? ''}](${markdownDestination(src)})`
    if (!href) return image
    return linkTitle ? `[${image}](${markdownDestination(href)} "${linkTitle}")` : `[${image}](${markdownDestination(href)})`
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(this.options.HTMLAttributes, { ...HTMLAttributes, src: this.options.resolveSource(HTMLAttributes.src) })]
  },
})
