import { Fragment, Mark } from '@tiptap/pm/model'
import { diffText } from './inlineDiff.js'

/**
 * Scrive nell'editor un testo che può contenere formattazione Markdown (**grassetto**, *corsivo*, `codice`, link…) al posto
 * dell'intervallo `from`–`to`. Un `insertText` semplice lascerebbe gli asterischi come testo letterale (che al salvataggio
 * diventano `\*\*`) e farebbe perdere la formattazione del testo sostituito.
 *
 *  - testo su una riga: si interpreta come Markdown in linea; il testo senza formattazione propria prende quella del testo sostituito:
 *    le parole che restano uguali conservano il loro stile (una parola in grassetto resta in grassetto, il resto no) e quelle nuove
 *    prendono lo stile del punto che sostituiscono;
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
      const carried = inline.hasMarks ? null : carryMarks(state.doc, from, to, inline.fragment, state.schema)
      const content = carried || (inline.hasMarks || !inherited.length ? inline.fragment : applyMarks(inline.fragment, inherited, state.schema))
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

// Testo semplice `fragment` al posto di from–to (dentro uno stesso blocco di testo): ogni carattere che resta uguale tiene lo stile che aveva,
// quelli nuovi prendono lo stile del carattere che sostituiscono (o di quello che li precede). Null se non si può abbinare (allora si usa lo stile del primo frammento).
function carryMarks(doc, from, to, fragment, schema) {
  const $from = doc.resolve(from)
  if (!$from.parent.isTextblock || doc.resolve(to).parent !== $from.parent) return null
  const oldMarks = []
  let oldText = ''
  let plain = true
  doc.nodesBetween(from, to, (node, pos) => {
    if (node.isText) {
      const part = node.text.slice(Math.max(from, pos) - pos, Math.min(to, pos + node.nodeSize) - pos)
      for (let index = 0; index < part.length; index += 1) oldMarks.push(node.marks)
      oldText += part
    } else if (node.isInline) plain = false
    return true
  })
  let newText = ''
  fragment.forEach((node) => { if (node.isText) newText += node.text; else plain = false })
  if (!plain || !oldText || !newText) return null

  const { removed, added } = diffText(oldText, newText)
  const marksFor = new Array(newText.length)
  let o = 0
  let n = 0
  let ri = 0
  let ai = 0
  while (o < oldText.length || n < newText.length) {
    const r = removed[ri]
    const a = added[ai]
    const gapOld = r ? r[0] - o : oldText.length - o
    const gapNew = a ? a[0] - n : newText.length - n
    if (gapOld > 0 && gapNew > 0) {
      const length = Math.min(gapOld, gapNew)
      if (oldText.slice(o, o + length) !== newText.slice(n, n + length)) return null
      for (let k = 0; k < length; k += 1) marksFor[n + k] = oldMarks[o + k]
      o += length
      n += length
      continue
    }
    const startsRemoval = r && r[0] === o
    const carry = startsRemoval ? oldMarks[o] : (oldMarks[o - 1] || oldMarks[0])
    const progress = o + n
    if (startsRemoval) { o = r[1]; ri += 1 }
    if (a && a[0] === n) { for (let k = a[0]; k < a[1]; k += 1) marksFor[k] = carry; n = a[1]; ai += 1 }
    if (o + n === progress) return null
  }

  const nodes = []
  let start = 0
  for (let index = 1; index <= newText.length; index += 1) {
    if (index === newText.length || !Mark.sameSet(marksFor[index], marksFor[start])) {
      nodes.push(schema.text(newText.slice(start, index), marksFor[start]))
      start = index
    }
  }
  return Fragment.fromArray(nodes)
}

// Il testo di from–to (dentro uno stesso blocco di testo) come Markdown in linea, con la sua formattazione; null se non è possibile.
export function rangeToMarkdown(editor, from, to) {
  try {
    const { doc } = editor.state
    const $from = doc.resolve(from)
    if (!editor.markdown || !$from.parent.isTextblock || doc.resolve(to).parent !== $from.parent || from >= to) return null
    const content = doc.slice(from, to).content.toJSON()
    const text = editor.markdown.serialize({ type: 'doc', content: [{ type: 'paragraph', content }] }).trim()
    return text || null
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
