import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { DOMSerializer, Fragment } from '@tiptap/pm/model'
import { alignBlocks, diffText } from './inlineDiff.js'

/**
 * Modifiche dell'assistente "in sosta". Le modifiche dirette restano applicate al documento, ma ognuna è segnata come da rivedere:
 * il blocco nuovo è evidenziato, sopra compare quello vecchio (barrato) con i pulsanti Accetta / Rifiuta. Accettare la tiene,
 * rifiutare rimette il testo di prima. Si ragiona per blocchi di primo livello (paragrafi, titoli, elenchi…).
 *
 * Stato del plugin: { changes: [{ id, from, to, old }] } — `from`–`to` è l'intervallo di blocchi nel documento attuale e
 * `old` il contenuto (Fragment) che c'era prima della prima modifica dell'assistente su quell'intervallo.
 */
export const pendingKey = new PluginKey('owPendingChanges')

const MAX_MATRIX_CELLS = 2_000_000
let counter = 0
const newId = () => `pending-${(counter += 1)}`
// Durante una modifica tracciata non si scartano le voci "uguali al vecchio": lo fa trackEdit a fine lavoro.
let tracking = false

export const getPending = (state) => pendingKey.getState(state)?.changes || []

function topLevel(doc) {
  const list = []
  let pos = 0
  doc.forEach((node) => { list.push({ node, pos }); pos += node.nodeSize })
  return list
}

// Intervalli di blocchi di primo livello che differiscono tra due versioni: [{ preFrom, preTo, postFrom, postTo }].
function diffBlocks(before, after) {
  const a = topLevel(before)
  const b = topLevel(after)
  let start = 0
  while (start < a.length && start < b.length && a[start].node.eq(b[start].node)) start += 1
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1].node.eq(b[endB - 1].node)) { endA -= 1; endB -= 1 }
  const middleA = a.slice(start, endA)
  const middleB = b.slice(start, endB)
  const posA = (index) => (index < a.length ? a[index].pos : before.content.size)
  const posB = (index) => (index < b.length ? b[index].pos : after.content.size)
  const spans = []
  const push = (i0, i1, j0, j1) => spans.push({ preFrom: posA(i0), preTo: posA(i1), postFrom: posB(j0), postTo: posB(j1) })

  if (!middleA.length || !middleB.length || middleA.length * middleB.length > MAX_MATRIX_CELLS) {
    if (middleA.length || middleB.length) push(start, endA, start, endB)
    return spans
  }

  const n = middleA.length
  const m = middleB.length
  const width = m + 1
  const lcs = new Uint32Array((n + 1) * width)
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i * width + j] = middleA[i].node.eq(middleB[j].node) ? lcs[(i + 1) * width + j + 1] + 1 : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1])
    }
  }
  let i = 0
  let j = 0
  let open = null
  const flush = () => { if (open) { push(start + open.i, start + i, start + open.j, start + j); open = null } }
  while (i < n || j < m) {
    if (i < n && j < m && middleA[i].node.eq(middleB[j].node)) {
      flush()
      i += 1
      j += 1
    } else {
      if (!open) open = { i, j }
      if (j >= m || (i < n && lcs[(i + 1) * width + j] >= lcs[i * width + j + 1])) i += 1
      else j += 1
    }
  }
  flush()
  return spans
}

// Dove finisce, dopo la modifica, una posizione del documento di prima: fuori dai blocchi cambiati si sposta della differenza di lunghezza, dentro
// un blocco cambiato (che ora è un altro testo) va al suo inizio o alla sua fine. Si ragiona sulle stesse differenze per blocchi di diffBlocks, non
// sulla mappatura della trasformazione: se la modifica ha sostituito l'intero documento (una riscrittura completa), quella manda ogni posizione
// precedente in fondo al documento, e una modifica in sosta già presente prendeva un intervallo enorme.
function mapThroughDiff(position, spans, end) {
  let delta = 0
  for (const span of spans) {
    if (position <= span.preFrom) break
    if (position >= span.preTo) { delta += (span.postTo - span.postFrom) - (span.preTo - span.preFrom); continue }
    return end ? span.postTo : span.postFrom
  }
  return position + delta
}

/**
 * Esegue `edit` (una o più modifiche dell'assistente al documento) e segna come da rivedere ciò che è cambiato.
 * Modifiche successive sullo stesso punto si fondono, conservando il testo originale più vecchio.
 * Restituisce false se la modifica non ha cambiato il documento.
 */
export function trackEdit(editor, edit) {
  if (!editor?.view || !pendingKey.get(editor.state)) { const start = editor?.state?.doc; edit(); return !start || !start.eq(editor.state.doc) }
  const before = editor.state.doc
  const existing = getPending(editor.state)
  tracking = true
  try { edit() } finally { tracking = false }
  const after = editor.state.doc
  if (before.eq(after)) return false

  const spans = diffBlocks(before, after)
  const units = existing.map((change) => ({ id: change.id, existing: true, preFrom: change.from, preTo: change.to, from: mapThroughDiff(change.from, spans, false), to: mapThroughDiff(change.to, spans, true), old: change.old }))
  for (const span of spans) units.push({ existing: false, preFrom: span.preFrom, preTo: span.preTo, from: span.postFrom, to: span.postTo })
  units.sort((x, y) => x.preFrom - y.preFrom || x.preTo - y.preTo)

  // Le unità che si sovrappongono nel documento di prima (una modifica nuova su un punto già in sosta) diventano una sola.
  const groups = []
  for (const unit of units) {
    const last = groups.at(-1)
    if (last && unit.preFrom < last.preTo) {
      last.members.push(unit)
      last.preTo = Math.max(last.preTo, unit.preTo)
      last.from = Math.min(last.from, unit.from)
      last.to = Math.max(last.to, unit.to)
    } else {
      groups.push({ members: [unit], preFrom: unit.preFrom, preTo: unit.preTo, from: unit.from, to: unit.to })
    }
  }

  const changes = []
  for (const group of groups) {
    // Il testo "di prima" è quello del documento prima di questa modifica, ma dove c'era già una modifica in sosta vale il suo originale.
    let cursor = group.preFrom
    let old = Fragment.empty
    for (const member of group.members.filter((item) => item.existing)) {
      if (member.preFrom > cursor) old = old.append(before.slice(cursor, member.preFrom).content)
      old = old.append(member.old)
      cursor = Math.max(cursor, member.preTo)
    }
    if (cursor < group.preTo) old = old.append(before.slice(cursor, group.preTo).content)
    const id = group.members.find((item) => item.existing)?.id || newId()
    const current = after.slice(group.from, group.to).content
    if (!old.eq(current)) changes.push({ id, from: group.from, to: group.to, old })
  }
  editor.view.dispatch(editor.state.tr.setMeta(pendingKey, { set: changes }).setMeta('addToHistory', false))
  return true
}

// Le modifiche in sosta devono sopravvivere a un riavvio o a un cambio di progetto: nella sessione si salvano per blocchi di primo livello
// (non per posizioni, che dipendono dal testo letto di nuovo) con il testo precedente in JSON.
const blockStarts = (doc) => {
  const starts = []
  let position = 0
  doc.forEach((node) => { starts.push(position); position += node.nodeSize })
  return starts
}

// Dati da salvare nella sessione, o null se non c'è nulla da rivedere.
export function serializePending(editor) {
  if (!editor?.view || editor.isDestroyed) return null
  const changes = getPending(editor.state)
  if (!changes.length) return null
  const { doc } = editor.state
  const starts = blockStarts(doc)
  // Indice del primo blocco che inizia a `position` o dopo (starts.length = fine del documento).
  const indexAt = (position) => { const index = starts.findIndex((start) => start >= position); return index === -1 ? starts.length : index }
  return {
    version: 1,
    blocks: starts.length,
    length: doc.textContent.length,
    changes: changes.map((change) => ({ fromBlock: indexAt(change.from), toBlock: indexAt(change.to), old: change.old.toJSON() })),
  }
}

// Rimette in sosta le modifiche salvate. Solo se il documento riletto è quello di prima (stesso numero di blocchi e stessa quantità di testo):
// altrimenti i punti non coinciderebbero e si mostrerebbe una revisione sbagliata. Restituisce true se le ha ripristinate.
export function restorePending(editor, data) {
  if (!data || data.version !== 1 || !editor?.view || editor.isDestroyed) return false
  const { doc, schema } = editor.state
  const starts = blockStarts(doc)
  if (data.blocks !== starts.length || data.length !== doc.textContent.length) return false
  try {
    const position = (block) => (block < starts.length ? starts[block] : doc.content.size)
    const changes = data.changes.map((change) => ({ id: newId(), from: position(change.fromBlock), to: position(change.toBlock), old: Fragment.fromJSON(schema, change.old) }))
    editor.view.dispatch(editor.state.tr.setMeta(pendingKey, { set: changes }).setMeta('addToHistory', false))
    return true
  } catch {
    return false
  }
}

export function acceptAll(editor) {
  if (!getPending(editor.state).length) return
  editor.view.dispatch(editor.state.tr.setMeta(pendingKey, { clear: true }).setMeta('addToHistory', false))
}

export function rejectAll(editor) {
  const changes = [...getPending(editor.state)].sort((x, y) => y.from - x.from)
  if (!changes.length) return
  const { tr } = editor.state
  for (const change of changes) tr.replaceWith(change.from, change.to, change.old)
  editor.view.dispatch(tr.setMeta(pendingKey, { clear: true }))
}

// ---- Differenze fini: si mostra solo ciò che è davvero cambiato dentro un paragrafo, non l'intero paragrafo sostituito. ----
// I blocchi di testo (paragrafi, titoli, voci di elenco, celle…) vecchi e nuovi si abbinano per somiglianza; per quelli abbinati si confrontano le parole.
// Nel documento le parole nuove sono evidenziate, nel blocco "prima" quelle tolte sono barrate e il resto è lasciato com'è.
const ATOM_SELECTOR = '[data-html-inline], [data-math-inline], [data-footnote-ref], img'
const TEXTBLOCK_SELECTOR = 'p, h1, h2, h3, h4, h5, h6, h7, pre'

// Testo di un blocco di testo: solo i nodi di testo (i nodi come a capo o immagini non contano), con la posizione di ogni pezzo.
function blockText(node) {
  const pieces = []
  let text = ''
  node.descendants((child, pos) => {
    if (child.isText) { pieces.push({ pos, start: text.length, length: child.text.length }); text += child.text }
    return true
  })
  return { text, pieces }
}

function textblocksIn(fragmentOrDoc, from, to) {
  const list = []
  const visit = (node, pos) => {
    if (node.isTextblock) { const { text, pieces } = blockText(node); list.push({ node, pos, type: node.type.name, text, pieces }); return false }
    return true
  }
  if (from === undefined) fragmentOrDoc.descendants(visit)
  else fragmentOrDoc.nodesBetween(from, to, visit)
  return list
}

const hasTextblock = (node) => { if (node.isTextblock) return true; let found = false; node.descendants((child) => { if (child.isTextblock) found = true; return !found }); return found }

// Intervallo di caratteri [da, a) di un blocco → intervalli di posizioni nel documento (un testo può essere diviso in più nodi).
function toPositions(block, from, to, base) {
  const out = []
  for (const piece of block.pieces) {
    const start = Math.max(from, piece.start)
    const end = Math.min(to, piece.start + piece.length)
    if (start < end) out.push([base + block.pos + 1 + piece.pos + (start - piece.start), base + block.pos + 1 + piece.pos + (end - piece.start)])
  }
  return out
}

// Posizione nel documento (relativa a `base`) di un punto del testo di un blocco, o -1 se il blocco non ha testo.
function offsetToPosition(block, offset, base) {
  let found = null
  for (const piece of block.pieces) {
    if (offset < piece.start) break
    if (offset <= piece.start + piece.length) found = piece
  }
  return found ? base + block.pos + 1 + found.pos + (offset - found.start) : -1
}

// Oltre questa quota di testo cambiato (tolto + aggiunto, sul totale di vecchio + nuovo) un blocco è una sostituzione, non un ritocco.
const INLINE_MAX_CHANGED = 0.5

const analysisCache = new WeakMap()

// Piano di visualizzazione di una modifica, o null se conviene mostrare tutto com'era (nessun blocco abbinabile, o solo struttura cambiata).
function analyzeChange(doc, change) {
  const content = doc.slice(change.from, change.to).content
  const cached = analysisCache.get(change.old)
  if (cached && cached.content.eq(content)) return cached.plan
  const plan = buildPlan(doc, change)
  analysisCache.set(change.old, { content, plan })
  return plan
}

function buildPlan(doc, change) {
  const olds = textblocksIn(change.old)
  const news = textblocksIn(doc, change.from, change.to)
  if (!olds.length && !news.length) return null
  const map = alignBlocks(olds.map(({ text, type }) => ({ text, type })), news.map(({ text, type }) => ({ text, type })))
  const base = -change.from
  const decorations = []
  const oldState = olds.map(() => ({ state: 'removed' }))
  let marked = false
  let allIdentical = true
  // Ritocchi leggeri (poche parole cambiate): si mostrano nel testo, con le parole tolte barrate accanto alle nuove, senza il blocco "prima" sopra.
  // Le sostituzioni intere, e tutto ciò che non è solo testo cambiato, restano nella vista a due blocchi.
  let inline = true
  const removedWidgets = []
  news.forEach((block, index) => {
    const matched = map[index]
    const at = block.pos + base
    if (matched === -1) {
      // Un paragrafo vuoto nuovo (es. quello che l'editor aggiunge in fondo dopo un elenco) non è una modifica da mostrare.
      if (!block.text) return
      decorations.push({ from: at, to: at + block.node.nodeSize, node: true, class: 'ow-pending-new' })
      marked = true
      allIdentical = false
      inline = false
      return
    }
    const before = olds[matched]
    if (before.node.eq(block.node)) { oldState[matched] = { state: 'same' }; return }
    allIdentical = false
    marked = true
    decorations.push({ from: at, to: at + block.node.nodeSize, node: true, class: 'ow-pending-touched' })
    // Stesso testo ma formato diverso: si segna tutto il testo; altrimenti solo le parole cambiate.
    const changes = before.text === block.text ? { removed: before.text ? [[0, before.text.length]] : [], added: block.text ? [[0, block.text.length]] : [] } : diffText(before.text, block.text)
    oldState[matched] = { state: 'changed', removed: changes.removed }
    const changedChars = [...changes.removed, ...changes.added].reduce((sum, range) => sum + range[1] - range[0], 0)
    if (before.text === block.text || changedChars / (before.text.length + block.text.length) > INLINE_MAX_CHANGED) inline = false
    else {
      for (const [from, to, where] of changes.removed) {
        const position = offsetToPosition(block, where, base)
        if (position === -1) inline = false
        else removedWidgets.push({ at: position, text: before.text.slice(from, to) })
      }
    }
    for (const [from, to] of changes.added) for (const [start, end] of toPositions(block, from, to, base)) decorations.push({ from: start, to: end, node: false, class: 'ow-pending-added' })
  })
  // Blocchi senza testo (linee orizzontali, immagini…) che prima non c'erano.
  const oldTop = []
  change.old.forEach((node) => oldTop.push(node))
  doc.nodesBetween(change.from, change.to, (node, pos) => {
    if (pos < change.from || pos + node.nodeSize > change.to || hasTextblock(node)) return pos < change.from ? true : false
    if (!oldTop.some((candidate) => candidate.eq(node))) { decorations.push({ from: pos + base, to: pos + base + node.nodeSize, node: true, class: 'ow-pending-new' }); marked = true; allIdentical = false; inline = false }
    return false
  })
  if (oldState.some((entry) => entry.state !== 'same')) marked = true
  // Solo la struttura è cambiata (es. da elenco puntato a numerato): meglio mostrare tutto come prima.
  const shape = (nodes) => nodes.map((node) => node.type.name).join(',')
  const newTop = []
  doc.slice(change.from, change.to).content.forEach((node) => newTop.push(node))
  if (!marked || (allIdentical && oldState.every((entry) => entry.state === 'same') && shape(oldTop) !== shape(newTop))) return null
  if (oldState.some((entry) => entry.state === 'removed') || shape(oldTop) !== shape(newTop)) inline = false
  const signature = oldState.map((entry) => (entry.state === 'changed' ? `c${entry.removed.map((range) => range.join('-')).join('.')}` : entry.state[0])).join('|') + (inline ? 'i' : '')
  return { decorations, oldState, signature, oldCount: olds.length, inline, removedWidgets }
}

// Segna nel DOM del blocco "prima" le parole tolte (intervalli di caratteri sul testo, senza i nodi come a capo o immagini).
function wrapRanges(element, ranges) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, { acceptNode: (node) => (node.parentElement?.closest(ATOM_SELECTOR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) })
  const nodes = []
  let offset = 0
  for (let node = walker.nextNode(); node; node = walker.nextNode()) { nodes.push({ node, start: offset }); offset += node.nodeValue.length }
  for (const { node, start } of nodes.reverse()) {
    const end = start + node.nodeValue.length
    const pieces = ranges.map(([from, to]) => [Math.max(from, start) - start, Math.min(to, end) - start]).filter(([from, to]) => from < to).sort((x, y) => y[0] - x[0])
    for (const [from, to] of pieces) {
      if (to < node.nodeValue.length) node.splitText(to)
      const middle = from > 0 ? node.splitText(from) : node
      const span = document.createElement('span')
      span.className = 'ow-pending-removed'
      middle.parentNode.insertBefore(span, middle)
      span.append(middle)
    }
  }
}

function widget(view, change, labels, plan) {
  const root = document.createElement('div')
  root.className = 'ow-pending-widget'
  root.contentEditable = 'false'

  const bar = document.createElement('div')
  bar.className = 'ow-pending-bar'
  const caption = document.createElement('span')
  caption.textContent = labels.caption
  bar.append(caption)
  const button = (text, className, onClick) => {
    const element = document.createElement('button')
    element.type = 'button'
    element.className = className
    element.textContent = text
    element.addEventListener('mousedown', (event) => event.preventDefault())
    element.addEventListener('click', onClick)
    return element
  }
  bar.append(
    button(labels.accept, 'ow-pending-accept', () => {
      view.dispatch(view.state.tr.setMeta(pendingKey, { remove: [change.id] }).setMeta('addToHistory', false))
    }),
    button(labels.reject, 'ow-pending-reject', () => {
      const current = getPending(view.state).find((item) => item.id === change.id)
      if (!current) return
      view.dispatch(view.state.tr.replaceWith(current.from, current.to, current.old).setMeta(pendingKey, { remove: [change.id] }))
    }),
  )
  root.append(bar)

  if (change.old.size && !plan?.inline) {
    const old = document.createElement('div')
    old.className = 'ow-pending-old'
    old.append(DOMSerializer.fromSchema(view.state.schema).serializeFragment(change.old))
    const blocks = plan ? [...old.querySelectorAll(TEXTBLOCK_SELECTOR)] : []
    if (plan && blocks.length === plan.oldCount) {
      // Il blocco "prima" mostra solo ciò che è cambiato: le parole tolte barrate, i paragrafi invariati attenuati, quelli tolti del tutto barrati.
      blocks.forEach((element, index) => {
        const entry = plan.oldState[index]
        if (entry.state === 'same') element.classList.add('ow-pending-same')
        else if (entry.state === 'removed') element.classList.add('ow-pending-removed-block')
        else wrapRanges(element, entry.removed)
      })
    } else {
      old.classList.add('ow-pending-old--all')
    }
    root.append(old)
  }
  return root
}

export const PendingChanges = Extension.create({
  name: 'pendingChanges',

  addOptions() {
    return { labels: { caption: 'Edited by the assistant', accept: 'Accept', reject: 'Reject' } }
  },

  addProseMirrorPlugins() {
    const { labels } = this.options
    return [
      new Plugin({
        key: pendingKey,
        state: {
          init: () => ({ changes: [] }),
          apply(transaction, value, _oldState, newState) {
            const meta = transaction.getMeta(pendingKey)
            let { changes } = value
            if (transaction.docChanged) {
              changes = changes.map((change) => {
                const from = transaction.mapping.map(change.from, 1)
                return { ...change, from, to: Math.max(from, transaction.mapping.map(change.to, -1)) }
              })
            }
            if (meta?.set) changes = meta.set
            else if (meta?.remove) changes = changes.filter((change) => !meta.remove.includes(change.id))
            else if (meta?.clear) changes = []
            else if (transaction.docChanged && !tracking) {
              // Dopo un "Annulla" (o una correzione a mano) un intervallo tornato uguale all'originale non è più una modifica.
              changes = changes.filter((change) => {
                try { return !change.old.eq(newState.doc.slice(change.from, change.to).content) } catch { return false }
              })
            }
            return { changes }
          },
        },
        props: {
          decorations(state) {
            const changes = getPending(state)
            if (!changes.length) return DecorationSet.empty
            const decorations = []
            for (const change of changes) {
              let plan = null
              try { plan = analyzeChange(state.doc, change) } catch { plan = null }
              if (plan) {
                for (const item of plan.decorations) {
                  const from = change.from + item.from
                  const to = change.from + item.to
                  decorations.push(item.node ? Decoration.node(from, to, { class: item.class }) : Decoration.inline(from, to, { class: item.class }))
                }
                if (plan.inline) {
                  for (const item of plan.removedWidgets) {
                    decorations.push(Decoration.widget(change.from + item.at, () => {
                      const span = document.createElement('span')
                      span.className = 'ow-pending-removed ow-pending-removed-inline'
                      span.contentEditable = 'false'
                      span.textContent = item.text
                      return span
                    }, { side: -1, key: `${change.id}:rm:${item.at}:${item.text}`, ignoreSelection: true }))
                  }
                }
              } else {
                state.doc.forEach((node, offset) => {
                  if (offset >= change.from && offset + node.nodeSize <= change.to) decorations.push(Decoration.node(offset, offset + node.nodeSize, { class: 'ow-pending-new' }))
                })
              }
              decorations.push(Decoration.widget(change.from, (view) => widget(view, change, labels, plan), { side: -1, key: `${change.id}:${change.old.size}:${plan ? plan.signature : 'all'}`, ignoreSelection: true, stopEvent: () => true }))
            }
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})
