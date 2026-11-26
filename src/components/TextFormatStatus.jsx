import { useContext } from 'react'
import { ContextMenuContext } from './ContextMenu.jsx'
import { t } from '../i18n/index.js'

// Come negli editor, in basso a destra della barra di stato: il tipo di a capo (LF o CRLF) e la codifica (UTF-8, con o senza la firma BOM) del file di testo aperto.
// Un clic apre un menu sopra il pulsante; la scelta cambia come si salverà il file (conta come modifica anche a testo invariato).
const button = 'rounded px-1.5 py-0.5 text-slate-500 transition hover:text-accent-400 disabled:opacity-40 disabled:hover:text-slate-500'

const EOLS = [
  { value: 'lf', label: 'LF', description: 'Unix, macOS' },
  { value: 'crlf', label: 'CRLF', description: 'Windows' },
]
const ENCODINGS = [
  { value: false, label: 'UTF-8' },
  { value: true, label: 'UTF-8 BOM' },
]

export default function TextFormatStatus({ tab, onChange }) {
  const openMenu = useContext(ContextMenuContext)
  const readOnly = Boolean(tab.readOnly)
  const eol = tab.eol === 'crlf' ? 'crlf' : 'lf'
  const bom = Boolean(tab.bom)

  const open = (event, items) => {
    const rect = event.currentTarget.getBoundingClientRect()
    // Il menu si apre sopra il pulsante: la barra sta in fondo alla finestra.
    openMenu({ x: rect.left, y: rect.top - 2, above: true, items })
  }
  const mark = (current) => (current ? '✓ ' : '    ')

  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        title={t('Line ending of the file (click to change)')}
        aria-haspopup="menu"
        disabled={readOnly}
        className={button}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => open(event, EOLS.map((item) => ({ label: `${mark(eol === item.value)}${item.label}`, hint: item.description, onClick: () => onChange({ eol: item.value }) })))}
      >{eol === 'crlf' ? 'CRLF' : 'LF'}</button>
      <button
        type="button"
        title={t('Encoding of the file (click to change). Some programs need the UTF-8 signature (BOM) to recognise it.')}
        aria-haspopup="menu"
        disabled={readOnly}
        className={button}
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => open(event, ENCODINGS.map((item) => ({ label: `${mark(bom === item.value)}${item.label}`, onClick: () => onChange({ bom: item.value }) })))}
      >{bom ? 'UTF-8 BOM' : 'UTF-8'}</button>
    </span>
  )
}
