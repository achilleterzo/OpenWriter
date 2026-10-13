import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { DOMSerializer, Fragment } from '@tiptap/pm/model'

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

/**
 * Esegue `edit` (una o più modifiche dell'assistente al documento) e segna come da rivedere ciò che è cambiato.
 * Modifiche successive sullo stesso punto si fondono, conservando il testo originale più vecchio.
 */
export function trackEdit(editor, edit) {
  if (!editor?.view || !pendingKey.get(editor.state)) { edit(); return }
  const before = editor.state.doc
  const existing = getPending(editor.state)
  tracking = true
  try { edit() } finally { tracking = false }
  const after = editor.state.doc
  if (before.eq(after)) return

  const mapped = new Map(getPending(editor.state).map((change) => [change.id, change]))
  const units = existing.map((change) => ({ id: change.id, existing: true, preFrom: change.from, preTo: change.to, from: mapped.get(change.id)?.from ?? change.from, to: mapped.get(change.id)?.to ?? change.to, old: change.old }))
  for (const span of diffBlocks(before, after)) units.push({ existing: false, preFrom: span.preFrom, preTo: span.preTo, from: span.postFrom, to: span.postTo })
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

function widget(view, change, labels) {
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

  if (change.old.size) {
    const old = document.createElement('div')
    old.className = 'ow-pending-old'
    old.append(DOMSerializer.fromSchema(view.state.schema).serializeFragment(change.old))
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
              state.doc.forEach((node, offset) => {
                if (offset >= change.from && offset + node.nodeSize <= change.to) decorations.push(Decoration.node(offset, offset + node.nodeSize, { class: 'ow-pending-new' }))
              })
              decorations.push(Decoration.widget(change.from, (view) => widget(view, change, labels), { side: -1, key: `${change.id}:${change.old.size}`, ignoreSelection: true, stopEvent: () => true }))
            }
            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})
