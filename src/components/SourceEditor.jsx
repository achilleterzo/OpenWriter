import { memo, useEffect, useMemo, useRef } from 'react'
import { collapseEmbeddedImages, expandEmbeddedImages } from '../lib/embeddedImages.js'
import { lineOf, lineStarts } from '../lib/textSearch.js'

// Una riga della colonna dei numeri: il numero (se serve) e la copia invisibile del testo, con le evidenziazioni della ricerca (`marks`: [{ from, to, current }], da 0 sulla riga).
const Line = memo(function Line({ index, line, marks, numbers }) {
  let content = line || ' '
  if (marks?.length) {
    const parts = []
    let cursor = 0
    marks.forEach((mark, position) => {
      parts.push(line.slice(cursor, mark.from))
      parts.push(<mark key={position} className={mark.current ? 'source-mark source-mark-current' : 'source-mark'}>{line.slice(mark.from, mark.to) || ' '}</mark>)
      cursor = mark.to
    })
    parts.push(line.slice(cursor))
    content = parts
  }
  return (
    <div className="source-line" data-line={index}>
      {numbers && <span className="source-line-number">{index + 1}</span>}
      <span className="source-line-text">{content}</span>
    </div>
  )
})

// Campo di testo con i numeri di riga a sinistra. Il testo va a capo come nell'editor: ogni numero si allinea alla prima riga visiva della sua riga,
// perché la colonna dei numeri contiene una copia invisibile del testo che va a capo allo stesso modo. Scorre tutto insieme (un solo contenitore).
// La stessa copia porta le evidenziazioni della ricerca: il testo è trasparente e lo sfondo si vede dietro il campo.
const Numbers = memo(function Numbers({ text, marks, numbers }) {
  const lines = useMemo(() => text.split('\n'), [text])
  // Le evidenziazioni per riga (una corrispondenza su più righe si spezza).
  const perLine = useMemo(() => {
    if (!marks?.length) return null
    const starts = lineStarts(text)
    const buckets = new Map()
    for (const mark of marks) {
      for (let row = lineOf(starts, mark.from); row < starts.length && starts[row] < mark.to; row += 1) {
        const rowEnd = starts[row] + lines[row].length
        const from = Math.max(mark.from, starts[row]) - starts[row]
        const to = Math.min(mark.to, rowEnd) - starts[row]
        if (to > from || (to === from && mark.from === mark.to)) {
          if (!buckets.has(row)) buckets.set(row, [])
          buckets.get(row).push({ from, to, current: mark.current })
        }
      }
    }
    return buckets
  }, [marks, text, lines])
  return (
    <div aria-hidden="true" className="source-lines">
      {lines.map((line, index) => <Line key={index} index={index} line={line} marks={perLine?.get(index)} numbers={numbers} />)}
    </div>
  )
})

/**
 * Il campo di testo con i numeri di riga: la vista sorgente del Markdown e il lettore testuale.
 * `lineNumbers`: mostra i numeri (sì per il Markdown). `plain`: testo semplice, senza il trattamento delle immagini incorporate del Markdown; solo qui valgono `marks`
 * (le corrispondenze trovate: [{ from, to, current }] come posizioni nel testo) e `reveal` ({ position, nonce }: porta in vista quella posizione).
 */
export default function SourceEditor({ value, onChange, label, lineNumbers = true, plain = false, marks = null, reveal = null, readOnly = false }) {
  const container = useRef(null)
  // I dati base64 delle immagini incorporate (megabyte su una riga sola) bloccherebbero l'impaginazione, due volte (campo e colonna dei numeri):
  // si mostrano come segnaposto e tornano interi nel documento a ogni modifica.
  const shown = useMemo(() => (plain ? { text: value, blobs: null } : collapseEmbeddedImages(value)), [value, plain])

  useEffect(() => {
    if (!reveal) return
    const row = lineOf(lineStarts(shown.text), reveal.position)
    container.current?.querySelector(`[data-line="${row}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [reveal?.nonce]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={container} className={`document-source h-full overflow-y-auto ${lineNumbers ? '' : 'source-plain'}`}>
      <div className="source-wrap">
        <Numbers text={shown.text} marks={plain ? marks : null} numbers={lineNumbers} />
        <textarea
          value={shown.text}
          spellCheck={false}
          wrap="soft"
          readOnly={readOnly}
          aria-label={label}
          className="source-input"
          onChange={(event) => onChange(plain ? event.target.value : expandEmbeddedImages(event.target.value, shown.blobs))}
        />
      </div>
    </div>
  )
}
