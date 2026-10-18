import { Extension } from '@tiptap/core'
import Italic from '@tiptap/extension-italic'

/**
 * Scrittura sicura dei segni (grassetto, corsivo, barrato…) in Markdown.
 * Il serializzatore di tiptap scrive i segni con delimitatori fissi, e uno spazio dentro il segno, accanto al delimitatore di chiusura
 * (`***testo. ***`), per CommonMark non chiude: alla riapertura il documento mostrava asterischi veri nel testo, e a ogni salvataggio il danno restava.
 * Succede spesso nei documenti convertiti da Word, dove lo spazio prima di un a capo ha lo stesso grassetto del testo.
 * Prima di scrivere, gli spazi ai bordi di un tratto formattato perdono i segni che il vicino non ha: lo spazio fra due parole in grassetto resta in
 * grassetto, quello alla fine del tratto (o prima di un a capo) no.
 */
const sameMarks = (left, right) => JSON.stringify(left || []) === JSON.stringify(right || [])
const markKey = (mark) => JSON.stringify([mark.type, mark.attrs || null])

function intersect(marks, ...neighbours) {
  const sets = neighbours.map((node) => new Set(((node && node.type === 'text' && node.marks) || []).map(markKey)))
  return (marks || []).filter((mark) => sets.every((set) => set.has(markKey(mark))))
}

function normalizeInline(content) {
  // 1. Ogni testo si divide in spazio iniziale, corpo e spazio finale.
  const parts = []
  for (const node of content) {
    if (node.type !== 'text' || !node.marks?.length || !node.text) { parts.push({ node, edge: false }); continue }
    const lead = /^\s*/.exec(node.text)[0]
    const trail = /\s*$/.exec(node.text)[0]
    const core = node.text.slice(lead.length, node.text.length - trail.length)
    if (!core) { parts.push({ node, edge: true, both: true }); continue }
    if (lead) parts.push({ node: { ...node, text: lead }, edge: true, side: 'lead' })
    parts.push({ node: { ...node, text: core }, edge: false })
    if (trail) parts.push({ node: { ...node, text: trail }, edge: true, side: 'trail' })
  }
  // 2. Gli spazi di bordo tengono solo i segni che ha anche il vicino dal lato esterno.
  const result = parts.map((part, index) => {
    if (!part.edge) return part.node
    const previous = parts[index - 1]?.node
    const next = parts[index + 1]?.node
    const marks = part.both ? intersect(part.node.marks, previous, next) : part.side === 'lead' ? intersect(part.node.marks, previous) : intersect(part.node.marks, next)
    return { ...part.node, marks: marks.length ? marks : undefined }
  })
  // 3. Testi vicini con gli stessi segni tornano uno solo.
  const merged = []
  for (const node of result) {
    const last = merged[merged.length - 1]
    if (last && last.type === 'text' && node.type === 'text' && sameMarks(last.marks, node.marks)) last.text += node.text
    else merged.push({ ...node })
  }
  const clean = merged.map((node) => (node.marks === undefined ? (({ marks, ...rest }) => rest)(node) : node))
  return chooseItalicDelimiters(clean)
}

const hasMark = (node, type) => Boolean(node.marks?.some((mark) => mark.type === type))

// Un corsivo che comprende grassetto solo in parte (`***a**.**"***`) con gli asterischi non si legge più: i tre segni vicini non si sciolgono e restano
// asterischi veri. In quel caso il tratto in corsivo usa `_` (`_**a**.**"**_`), che si legge sempre; negli altri casi resta `*`, come prima.
function chooseItalicDelimiters(nodes) {
  const result = nodes.map((node) => ({ ...node }))
  let start = 0
  const closeRun = (end) => {
    const run = result.slice(start, end).filter((node) => node.type === 'text' && hasMark(node, 'italic'))
    if (!run.length) return
    const bold = run.filter((node) => hasMark(node, 'bold')).length
    if (bold === 0 || bold === run.length) return
    for (const node of run) node.marks = node.marks.map((mark) => (mark.type === 'italic' ? { ...mark, attrs: { ...(mark.attrs || {}), delimiter: '_' } } : mark))
  }
  // I tratti in corsivo sono sequenze di testi vicini; un a capo o un altro nodo li interrompe.
  for (let index = 0; index <= result.length; index += 1) {
    const node = result[index]
    if (!node || node.type !== 'text' || !hasMark(node, 'italic')) {
      closeRun(index)
      start = index + 1
    }
  }
  return result
}

function normalize(node) {
  if (!node || typeof node !== 'object') return node
  if (!Array.isArray(node.content)) return node
  const children = node.content.map(normalize)
  return { ...node, content: children.some((child) => child.type === 'text') ? normalizeInline(children) : children }
}

// Avvolge il serializzatore Markdown dell'editor (una volta sola).
function wrapSerializer(editor) {
  const manager = editor.markdown
  if (!manager || manager.__safeMarks) return
  const serialize = manager.serialize.bind(manager)
  manager.serialize = (json, ...rest) => serialize(normalize(json), ...rest)
  manager.__safeMarks = true
}

// Da mettere dopo l'estensione Markdown: lei crea `editor.markdown` in onBeforeCreate.
export const SafeMarks = Extension.create({
  name: 'safeMarks',
  onBeforeCreate() { wrapSerializer(this.editor) },
  onCreate() { wrapSerializer(this.editor) },
})

// Corsivo con il delimitatore scelto in scrittura (attributo `delimiter`, solo per il serializzatore: non entra nel documento né nell'HTML).
export const MarkdownItalic = Italic.extend({
  addAttributes() {
    return { delimiter: { default: '*', rendered: false, parseHTML: () => '*' } }
  },
  renderMarkdown: (node, helpers) => {
    const delimiter = node.attrs?.delimiter === '_' ? '_' : '*'
    return `${delimiter}${helpers.renderChildren(node)}${delimiter}`
  },
})
