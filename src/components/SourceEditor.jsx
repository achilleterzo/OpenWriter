import { memo, useMemo } from 'react'
import { collapseEmbeddedImages, expandEmbeddedImages } from '../lib/embeddedImages.js'

// Campo di testo con i numeri di riga a sinistra. Il testo va a capo come nell'editor: ogni numero si allinea alla prima riga visiva della sua riga,
// perché la colonna dei numeri contiene una copia invisibile del testo che va a capo allo stesso modo. Scorre tutto insieme (un solo contenitore).
const Numbers = memo(function Numbers({ text }) {
  const lines = useMemo(() => text.split('\n'), [text])
  return (
    <div aria-hidden="true" className="source-lines">
      {lines.map((line, index) => (
        <div key={index} className="source-line">
          <span className="source-line-number">{index + 1}</span>
          <span className="source-line-text">{line || ' '}</span>
        </div>
      ))}
    </div>
  )
})

export default function SourceEditor({ value, onChange, label }) {
  // I dati base64 delle immagini incorporate (megabyte su una riga sola) bloccherebbero l'impaginazione, due volte (campo e colonna dei numeri):
  // si mostrano come segnaposto e tornano interi nel documento a ogni modifica.
  const shown = useMemo(() => collapseEmbeddedImages(value), [value])
  return (
    <div className="document-source h-full overflow-y-auto">
      <div className="source-wrap">
        <Numbers text={shown.text} />
        <textarea
          value={shown.text}
          spellCheck={false}
          wrap="soft"
          aria-label={label}
          className="source-input"
          onChange={(event) => onChange(expandEmbeddedImages(event.target.value, shown.blobs))}
        />
      </div>
    </div>
  )
}
