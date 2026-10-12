import Image from '@tiptap/extension-image'
import { mergeAttributes } from '@tiptap/core'

// Il documento conserva il `src` così come sta nel Markdown (relativo o file:///); nel DOM si mette l'indirizzo caricabile.
export const DocumentImage = Image.extend({
  addOptions() {
    return { ...this.parent?.(), resolveSource: (src) => src }
  },

  renderHTML({ HTMLAttributes }) {
    return ['img', mergeAttributes(this.options.HTMLAttributes, { ...HTMLAttributes, src: this.options.resolveSource(HTMLAttributes.src) })]
  },
})
