import { Info } from 'lucide-react'
import { t } from '../i18n/index.js'

/** Icona (i) con spiegazione: compare al passaggio del mouse o con il focus da tastiera. Va dentro un contenitore `relative`. */
export function InfoTip({ text }) {
  return (
    <>
      <button type="button" aria-label={t('What is this?')} className="peer rounded-full text-slate-500 transition hover:text-slate-200 focus:text-slate-200 focus:outline-none"><Info size={13} /></button>
      <span role="tooltip" className="pointer-events-none absolute inset-x-0 top-6 z-20 hidden rounded-md border border-slate-700 bg-slate-950 p-2.5 text-xs leading-5 text-slate-300 shadow-lg peer-hover:block peer-focus:block">{text}</span>
    </>
  )
}

// Con `stops` (valori che crescono in modo esponenziale) il cursore scorre tra gradini fissi: la posizione è quella del gradino più vicino.
const nearestStop = (stops, value) => stops.reduce((best, stop, index) => (Math.abs(Math.log(stop / value)) < Math.abs(Math.log(stops[best] / value)) ? index : best), 0)

/**
 * Parametro numerico come cursore. Il valore vuoto ('') significa "predefinito del modello": il cursore resta attenuato
 * finché non lo si muove, e "Ripristina" lo riporta a vuoto. Con `stops` il cursore scorre tra valori fissi, altrimenti tra min e max.
 */
export default function ParameterSlider({ id, label, help, value, onChange, stops, min, max, step, format = String, inherited = '' }) {
  const isDefault = value === '' || value == null
  // Senza valore proprio il cursore mostra, attenuato, quello che si eredita (se c'è).
  const shown = isDefault && inherited !== '' && inherited != null ? Number(inherited) : null
  const position = stops ? (isDefault ? (shown != null ? nearestStop(stops, shown) : Math.floor((stops.length - 1) / 2)) : nearestStop(stops, Number(value))) : isDefault ? (shown ?? (min + max) / 2) : Number(value)
  return (
    <div className="relative block text-xs text-slate-400">
      <div className="flex items-center gap-1.5">
        <label htmlFor={id}>{label}</label>
        {help && <InfoTip text={help} />}
        <span className="ml-auto tabular-nums text-slate-200">{isDefault ? (shown != null ? format(shown) : t('Default')) : format(Number(value))}</span>
        {!isDefault && <button type="button" className="rounded px-1 text-slate-500 transition hover:text-slate-100" onClick={() => onChange('')}>{t('Reset')}</button>}
      </div>
      <input
        id={id}
        type="range"
        min={stops ? 0 : min}
        max={stops ? stops.length - 1 : max}
        step={stops ? 1 : step}
        value={position}
        className={`mt-2 w-full accent-accent-500 ${isDefault ? 'opacity-50' : ''}`}
        onChange={(event) => {
          const raw = Number(event.target.value)
          onChange(stops ? stops[raw] : Math.round(raw * 100) / 100)
        }}
      />
    </div>
  )
}
