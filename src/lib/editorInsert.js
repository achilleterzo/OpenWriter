import { Fragment } from '@tiptap/pm/model'

/**
 * Scrive nell'editor un testo che può contenere formattazione Markdown (**grassetto**, *corsivo*, `codice`, link…) al posto
 * dell'intervallo `from`–`to`. Un `insertText` semplice lascerebbe gli asterischi come testo letterale (che al salvataggio
 * diventano `\*\*`) e farebbe perdere la formattazione del testo sostituito.
 *
 *  - testo su una riga: si interpreta come Markdown in linea; il testo senza formattazione propria prende quella del testo sostituito
 *    (se si sostituisce una parola in grassetto, resta in grassetto);
 *  - più righe, o una riga che il Markdown trasforma in un blocco (titolo, elenco…): si inserisce come Markdown a blocchi.
 */
export function replaceRangeWithMarkdown(editor, from, to, markdown) {
  const value = String(markdown ?? '')
  const { state, view } = editor
  if (value === '') {
    view.dispatch(state.tr.delete(from, to))
    return
  }
  if (!value.includes('\n')) {
    const inline = inlineFragment(editor, value)
    if (inline) {
      const inherited = marksOfRange(state.doc, from, to)
      const content = inline.hasMarks || !inherited.length ? inline.fragment : applyMarks(inline.fragment, inherited, state.schema)
      view.dispatch(state.tr.replaceWith(from, to, content))
      return
    }
  }
  editor.chain().insertContentAt({ from, to }, value, { contentType: 'markdown' }).run()
}

// Il Markdown su una riga come contenuto in linea, o null se diventa un blocco.
function inlineFragment(editor, value) {
  if (!editor.markdown) return null
  let json
  try { json = editor.markdown.parse(value) } catch { return null }
  const blocks = json?.content || []
  if (blocks.length !== 1 || blocks[0].type !== 'paragraph' || !blocks[0].content?.length) return null
  try {
    const paragraph = editor.schema.nodeFromJSON(blocks[0])
    let hasMarks = false
    paragraph.content.forEach((node) => { if (node.marks.length) hasMarks = true })
    return { fragment: paragraph.content, hasMarks }
  } catch {
    return null
  }
}

// Formattazione del testo che si sta sostituendo: quella del suo primo frammento di testo.
function marksOfRange(doc, from, to) {
  let marks = []
  doc.nodesBetween(from, Math.max(from, to), (node) => {
    if (marks.length || !node.isText) return !marks.length
    marks = [...node.marks]
    return false
  })
  return marks
}

function applyMarks(fragment, marks, schema) {
  const nodes = []
  fragment.forEach((node) => nodes.push(node.isText ? schema.text(node.text, marks) : node))
  return Fragment.fromArray(nodes)
}

// Un frammento di Markdown in linea come testo semplice (per mostrarlo senza asterischi e barre).
export function markdownToPlain(value) {
  return String(value ?? '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?=[^*\w]|$)/g, '$1$2')
    .replace(/(^|[^_\w])_(?!\s)(.+?)_(?=[^_\w]|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, '$1')
}
