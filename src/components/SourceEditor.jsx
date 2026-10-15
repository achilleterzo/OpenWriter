import { memo, useMemo } from 'react'

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
  return (
    <div className="document-source h-full overflow-y-auto">
      <div className="source-wrap">
        <Numbers text={value} />
        <textarea
          value={value}
          spellCheck={false}
          wrap="soft"
          aria-label={label}
          className="source-input"
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </div>
  )
}
