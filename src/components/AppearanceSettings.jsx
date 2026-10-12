import { useEffect, useState } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import { accents, defaultAppearance, fonts, fontSizeRange, getAppearance, lineHeights, subscribeAppearance, themes, updateAppearance, widths } from '../appearance.js'

function Segmented({ label, options, value, onChange }) {
  return (
    <div className="grid gap-2">
      <span className="text-sm text-slate-300">{label}</span>
      <div role="radiogroup" aria-label={label} className="inline-flex w-fit overflow-hidden rounded-lg border border-slate-700">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            className={`px-4 py-2 text-sm transition ${value === option.value ? 'bg-accent-600 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-50'}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function AppearanceSettings() {
  const [appearance, setAppearance] = useState(getAppearance)
  useEffect(() => subscribeAppearance(setAppearance), [])

  return (
    <div className="grid gap-6">
      <section className="grid gap-6 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
        <h2 className="text-lg font-semibold">Interfaccia</h2>
        <Segmented label="Tema" options={themes} value={appearance.theme} onChange={(theme) => updateAppearance({ theme })} />
        <div className="grid gap-2">
          <span className="text-sm text-slate-300">Colore d&apos;accento</span>
          <div role="radiogroup" aria-label="Colore d'accento" className="flex gap-3">
            {accents.map((accent) => (
              <button
                key={accent.value}
                type="button"
                role="radio"
                aria-checked={appearance.accent === accent.value}
                aria-label={accent.label}
                title={accent.label}
                style={{ backgroundColor: accent.swatch }}
                className={`flex h-8 w-8 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-slate-950 transition ${appearance.accent === accent.value ? 'ring-2 ring-slate-300' : 'hover:scale-110'}`}
                onClick={() => updateAppearance({ accent: accent.value })}
              >
                {appearance.accent === accent.value && <Check size={16} />}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">Editor</h2>
          <button type="button" className="flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-slate-50" onClick={() => updateAppearance(defaultAppearance)}>
            <RotateCcw size={13} /> Ripristina predefiniti
          </button>
        </div>
        <Segmented label="Carattere" options={fonts} value={appearance.font} onChange={(font) => updateAppearance({ font })} />
        <label className="grid gap-2 text-sm text-slate-300">
          <span className="flex justify-between"><span>Dimensione del testo</span><span className="text-slate-500">{appearance.fontSize} px</span></span>
          <input type="range" min={fontSizeRange.min} max={fontSizeRange.max} step="1" value={appearance.fontSize} className="accent-accent-500" onChange={(event) => updateAppearance({ fontSize: Number(event.target.value) })} />
        </label>
        <Segmented label="Interlinea" options={lineHeights} value={appearance.lineHeight} onChange={(lineHeight) => updateAppearance({ lineHeight })} />
        <Segmented label="Larghezza del testo" options={widths} value={appearance.width} onChange={(width) => updateAppearance({ width })} />

        <div className="rounded-lg border border-slate-800 bg-slate-900 p-1">
          <div className="document-editor mx-auto">
            <div className="tiptap">
              <h2>Anteprima</h2>
              <p>Il testo del documento appare così: <a href="#anteprima" onClick={(event) => event.preventDefault()}>un collegamento</a> e un po&apos; di <code>codice</code>.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
