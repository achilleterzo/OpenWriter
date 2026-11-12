import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import { Markdown } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'

// Markdown ristretto per il campo della chat: grassetto, corsivo, barrato, codice in linea, link e liste.
// Titoli, citazioni, blocchi di codice e linee orizzontali sono disattivati (incollati, diventano testo normale).
// Nessuna barra degli strumenti: si scrive con le scorciatoie Markdown standard ("- " o "1. " per le liste, **grassetto**, *corsivo*, `codice`).
const EXTENSIONS = [
  StarterKit.configure({
    heading: false,
    blockquote: false,
    codeBlock: false,
    horizontalRule: false,
    link: { openOnClick: false, autolink: false, linkOnPaste: false },
  }),
  Markdown,
]

// Testo che sembra Markdown (liste, titoli, enfasi, codice, link): solo allora l'incolla lo interpreta, altrimenti resta testo semplice.
const MARKDOWN_HINT = /(^|\n)\s*([-*+]|\d+[.)])\s+\S|(^|\n)#{1,6}\s+\S|\*\*[^*\n]+\*\*|__[^_\n]+__|(^|[^*\w])\*[^*\s][^*\n]*\*|~~[^~\n]+~~|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\)/

// Il testo di un titolo incollato si tiene come paragrafo in grassetto, per non perdere la gerarchia visiva del testo copiato.
const flattenHeadings = (markdown) => markdown.replace(/^#{1,6}\s+(.+)$/gm, '**$1**')

// Il campo è "vuoto" per il segnaposto solo se non c'è nulla, nemmeno la struttura: una lista appena iniziata (solo il pallino) ha già un blocco.
const isBlank = (editor) => editor.state.doc.childCount === 1 && editor.state.doc.firstChild.type.name === 'paragraph' && editor.state.doc.firstChild.content.size === 0

const ChatComposer = forwardRef(function ChatComposer({ placeholder, onEmptyChange, onSend, onPasteImages, onAcceptSuggestion, hasSuggestion }, ref) {
  const [blank, setBlank] = useState(true)
  const handlers = useRef({})
  handlers.current = { onEmptyChange, onSend, onPasteImages, onAcceptSuggestion, hasSuggestion }

  const editor = useEditor({
    extensions: EXTENSIONS,
    editorProps: {
      attributes: { class: 'chat-composer-content', 'aria-label': placeholder || '', role: 'textbox', 'aria-multiline': 'true' },
      handlePaste(view, event) {
        // Un'immagine incollata diventa un allegato.
        // Una cattura dello schermo può arrivare solo tra gli elementi degli appunti (non tra i file): si guardano entrambi.
        const data = event.clipboardData
        const fromItems = Array.from(data?.items || []).filter((item) => item.kind === 'file' && item.type.startsWith('image/')).map((item) => item.getAsFile()).filter(Boolean)
        const fromFiles = Array.from(data?.files || []).filter((file) => file.type.startsWith('image/'))
        const images = fromFiles.length ? fromFiles : fromItems
        if (images.length) {
          event.preventDefault()
          handlers.current.onPasteImages?.(images)
          return true
        }
        // Testo semplice che contiene Markdown: si interpreta. Con HTML (copiato da una pagina) decide l'editor, che scarta ciò che lo schema non ammette.
        const html = event.clipboardData?.getData('text/html')
        const plain = event.clipboardData?.getData('text/plain') || ''
        if (html || !MARKDOWN_HINT.test(plain)) return false
        event.preventDefault()
        editorRef.current?.chain().focus().insertContent(flattenHeadings(plain), { contentType: 'markdown' }).run()
        return true
      },
      handleKeyDown(view, event) {
        if (event.isComposing) return false
        const current = editorRef.current
        const { hasSuggestion: suggested, onAcceptSuggestion: accept, onSend: send } = handlers.current
        // Con la casella vuota, una freccia o Tab accettano il prompt suggerito dall'assistente.
        if (suggested && current && isBlank(current) && ['ArrowLeft', 'ArrowRight', 'Tab'].includes(event.key) && !event.shiftKey) {
          event.preventDefault()
          accept?.()
          return true
        }
        if (event.key !== 'Enter' || event.shiftKey || event.altKey) return false
        const withModifier = event.ctrlKey || event.metaKey
        // In una lista Invio crea la voce successiva (e su una voce vuota esce dalla lista): si invia con Ctrl+Invio o con il pulsante.
        if (!withModifier && current?.isActive('listItem')) return false
        event.preventDefault()
        // Con il modificatore (Ctrl/Cmd+Invio) il chiamante sa che il messaggio è «subito»: mentre l'assistente lavora aggiorna la risposta in corso.
        send?.(withModifier ? 'now' : undefined)
        return true
      },
    },
    onUpdate({ editor: updated }) {
      setBlank(isBlank(updated))
      handlers.current.onEmptyChange?.(updated.isEmpty)
    },
  })

  const editorRef = useRef(null)
  editorRef.current = editor

  useImperativeHandle(ref, () => ({
    // Il serializzatore protegge con "\" i caratteri speciali del testo (snake\_case, 2\*3): al modello si manda quello che l'utente ha scritto.
    getMarkdown: () => (editor && !editor.isEmpty ? editor.getMarkdown().trim().replace(/\\([\\`*_{}[\]()#+\-.!~|>])/g, '$1') : ''),
    setValue(markdown) {
      if (!editor) return
      editor.commands.setContent(markdown ? flattenHeadings(String(markdown)) : '', { contentType: 'markdown', emitUpdate: true })
    },
    focus: () => editor?.commands.focus('end'),
  }), [editor])

  useEffect(() => { handlers.current.onEmptyChange?.(true) }, [])

  return (
    <div className="chat-composer relative min-h-0 flex-1 rounded-md border border-slate-700 bg-slate-800 text-sm text-slate-100 focus-within:border-accent-400">
      {blank && placeholder && <span aria-hidden="true" className="pointer-events-none absolute left-3 right-3 top-2 truncate text-slate-500">{placeholder}</span>}
      <EditorContent editor={editor} />
    </div>
  )
})

export default ChatComposer
