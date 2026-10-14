import { useEffect, useState } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import { accents, defaultAppearance, fonts, fontSizeRange, getAppearance, lineHeights, subscribeAppearance, themes, updateAppearance, widths } from '../appearance.js'
import { t } from '../i18n/index.js'

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

// Caratteri più comuni, per quando il sistema non permette di elencare quelli installati.
const commonFamilies = ['Arial', 'Calibri', 'Cambria', 'Candara', 'Cascadia Code', 'Consolas', 'Courier New', 'Garamond', 'Georgia', 'Helvetica', 'Lucida Sans', 'Palatino Linotype', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana']

export default function AppearanceSettings() {
  const [appearance, setAppearance] = useState(getAppearance)
  useEffect(() => subscribeAppearance(setAppearance), [])
  // Caratteri installati (se il sistema li elenca), per il suggerimento nel campo; altrimenti quelli più comuni.
  const [families, setFamilies] = useState(commonFamilies)
  useEffect(() => {
    let cancelled = false
    if (typeof window.queryLocalFonts !== 'function') return undefined
    window.queryLocalFonts()
      .then((list) => { if (!cancelled && list.length) setFamilies([...new Set(list.map((font) => font.family))].sort((left, right) => left.localeCompare(right))) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  return (
    <div className="grid grid-cols-1 gap-6">
      <section className="grid grid-cols-1 gap-6 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
        <h2 className="text-lg font-semibold">{t('Interface')}</h2>
        <Segmented label={t('Theme')} options={themes} value={appearance.theme} onChange={(theme) => updateAppearance({ theme })} />
        <div className="grid gap-2">
          <span className="text-sm text-slate-300">{t('Accent color')}</span>
          <div role="radiogroup" aria-label={t('Accent color')} className="flex gap-3">
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

      <section className="grid grid-cols-1 gap-6 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">{t('Editor')}</h2>
          <button type="button" className="flex items-center gap-1.5 text-xs text-slate-500 transition hover:text-slate-50" onClick={() => updateAppearance(defaultAppearance)}>
            <RotateCcw size={13} /> {t('Restore defaults')}</button>
        </div>
        <Segmented label={t('Font')} options={fonts} value={appearance.font} onChange={(font) => updateAppearance({ font })} />
        <label className="grid gap-2 text-sm text-slate-300">
          <span>{t('Specific font (optional)')}</span>
          <input
            list="installed-fonts"
            value={appearance.fontFamily}
            maxLength={80}
            placeholder={t('Type or pick an installed font, e.g. Palatino Linotype')}
            className="w-full max-w-md rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none placeholder:text-slate-500 focus:border-accent-400"
            onChange={(event) => updateAppearance({ fontFamily: event.target.value })}
          />
          <datalist id="installed-fonts">{families.map((family) => <option key={family} value={family} />)}</datalist>
          <span className="text-xs text-slate-500">{t('If the font is not installed, the type above is used. It only changes how the text looks in the editor: it is not saved in the document and it is not exported.')}</span>
          <span className="rounded-md border border-slate-800 bg-slate-950/40 px-3 py-2 text-slate-300" style={{ fontFamily: appearance.fontFamily ? `"${appearance.fontFamily}", ${fonts.find((font) => font.value === appearance.font).family}` : fonts.find((font) => font.value === appearance.font).family }}>{t('The quick brown fox jumps over the lazy dog. 0123456789')}</span>
        </label>
        <label className="grid gap-2 text-sm text-slate-300">
          <span className="flex justify-between"><span>{t('Text size')}</span><span className="text-slate-500">{appearance.fontSize} px</span></span>
          <input type="range" min={fontSizeRange.min} max={fontSizeRange.max} step="1" value={appearance.fontSize} className="accent-accent-500" onChange={(event) => updateAppearance({ fontSize: Number(event.target.value) })} />
        </label>
        <Segmented label={t('Line spacing')} options={lineHeights} value={appearance.lineHeight} onChange={(lineHeight) => updateAppearance({ lineHeight })} />
        <Segmented label={t('Text width')} options={widths} value={appearance.width} onChange={(width) => updateAppearance({ width })} />

        <div className="rounded-lg border border-slate-800 bg-slate-900 p-1">
          <div className="document-editor mx-auto">
            <div className="tiptap">
              <h2>{t('Preview')}</h2>
              <p>{t('The document text looks like this:')} <a href="#anteprima" onClick={(event) => event.preventDefault()}>{t('a link')}</a> {t('and a bit of')} <code>{t('code')}</code>.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
