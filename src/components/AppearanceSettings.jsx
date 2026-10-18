import { useEffect, useState } from 'react'
import { Check, RotateCcw } from 'lucide-react'
import { accents, defaultAppearance, fontSizeRange, getAppearance, lineHeights, pagesViewEnabled, subscribeAppearance, themes, updateAppearance, views, widths } from '../appearance.js'
import { EditorFontChoice } from './FontPicker.jsx'
import Segmented from './Segmented.jsx'
import { t } from '../i18n/index.js'

export default function AppearanceSettings() {
  const [appearance, setAppearance] = useState(getAppearance)
  useEffect(() => subscribeAppearance(setAppearance), [])
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
        <div className="grid gap-2">
          <EditorFontChoice font={appearance.font} fontFamily={appearance.fontFamily} onChange={updateAppearance} />
          <span className="text-xs text-slate-500">{t('It only changes how the text looks in the editor: it is not saved in the document and it is not exported.')}</span>
        </div>
        <label className="grid gap-2 text-sm text-slate-300">
          <span className="flex justify-between"><span>{t('Text size')}</span><span className="text-slate-500">{appearance.fontSize} px</span></span>
          <input type="range" min={fontSizeRange.min} max={fontSizeRange.max} step="1" value={appearance.fontSize} className="accent-accent-500" onChange={(event) => updateAppearance({ fontSize: Number(event.target.value) })} />
        </label>
        <Segmented label={t('Line spacing')} options={lineHeights} value={appearance.lineHeight} onChange={(lineHeight) => updateAppearance({ lineHeight })} />
        {pagesViewEnabled && <Segmented label={t('Page layout')} options={views} value={appearance.view} onChange={(view) => updateAppearance({ view })} />}
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
