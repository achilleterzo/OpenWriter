import { useEffect, useMemo, useState } from 'react'
import { Check, Download, Search, Trash2 } from 'lucide-react'
import { curatedFonts, fetchCatalog, getInstalledFonts, installFont, loadFamily, removeFont, subscribeFonts } from '../lib/fonts.js'
import { fonts as genericFonts } from '../appearance.js'
import Segmented from './Segmented.jsx'
import { t } from '../i18n/index.js'

const MAX_RESULTS = 60
const hasCatalog = Boolean(window.electronAPI?.fonts)
const genericFamily = (category) => (genericFonts.find((font) => font.value === category) || genericFonts[0]).family

function FontCard({ font, selected, onSelect, onRemove }) {
  return (
    <div className={`group relative rounded-lg border transition ${selected ? 'border-accent-400 bg-slate-800' : 'border-slate-700 bg-slate-900 hover:bg-slate-800'}`}>
      <button type="button" role="radio" aria-checked={selected} className="block w-full px-3 py-2 text-left" onClick={onSelect}>
        <span className="block truncate text-base text-slate-100" style={{ fontFamily: `"${font.family}", ${genericFamily(font.category)}` }}>{font.family}</span>
        <span className="block text-[11px] text-slate-500">{font.category === 'sans' ? t('Sans-serif') : font.category === 'serif' ? t('Serif') : font.category === 'mono' ? t('Monospace') : ''}</span>
      </button>
      {selected && <Check size={14} className="pointer-events-none absolute right-2 top-2 text-accent-400" />}
      {onRemove && (
        <button type="button" title={t('Remove')} aria-label={t('Remove')} className="absolute bottom-1.5 right-1.5 rounded p-1 text-slate-500 opacity-0 transition hover:text-rose-400 focus:opacity-100 group-hover:opacity-100" onClick={onRemove}>
          <Trash2 size={13} />
        </button>
      )}
    </div>
  )
}

function Catalog({ installedNames }) {
  const [catalog, setCatalog] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState('')

  useEffect(() => {
    let cancelled = false
    fetchCatalog()
      .then((list) => { if (!cancelled) setCatalog(list) })
      .catch(() => { if (!cancelled) setError(t('Could not load the Google Fonts catalog. Check your internet connection.')) })
    return () => { cancelled = true }
  }, [])

  const matches = useMemo(() => {
    if (!catalog) return []
    const needle = query.trim().toLowerCase()
    return catalog.filter((font) => !needle || font.family.toLowerCase().includes(needle))
  }, [catalog, query])

  async function install(family) {
    setBusy(family)
    setError('')
    try {
      await installFont(family)
    } catch (failure) {
      setError(t('Could not install the font: {error}', { error: failure.message }))
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="grid gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <label className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus-within:border-accent-400">
        <Search size={14} className="text-slate-500" />
        <input autoFocus value={query} placeholder={t('Search fonts…')} className="w-full bg-transparent outline-none placeholder:text-slate-500" onChange={(event) => setQuery(event.target.value)} />
      </label>
      {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
      {!catalog && !error && <p className="text-xs text-slate-500">{t('Loading…')}</p>}
      {catalog && (
        <ul className="grid max-h-72 gap-1 overflow-y-auto pr-1">
          {matches.slice(0, MAX_RESULTS).map((font) => {
            const done = installedNames.has(font.family)
            return (
              <li key={font.family} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm text-slate-200 hover:bg-slate-800">
                <span className="truncate">{font.family} <span className="text-[11px] text-slate-500">{font.category === 'other' ? '' : font.category}</span></span>
                {done
                  ? <span className="flex items-center gap-1 text-xs text-slate-500"><Check size={13} /> {t('Installed')}</span>
                  : <button type="button" disabled={Boolean(busy)} className="flex items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1 text-xs text-slate-200 transition hover:bg-slate-700 disabled:opacity-50" onClick={() => install(font.family)}>
                    <Download size={13} /> {busy === font.family ? t('Installing…') : t('Install')}
                  </button>}
              </li>
            )
          })}
          {!matches.length && <li className="px-2 py-1.5 text-xs text-slate-500">{t('No fonts found')}</li>}
        </ul>
      )}
      {catalog && matches.length > MAX_RESULTS && <p className="text-xs text-slate-500">{t('Showing the first {count} results: refine the search to see more.', { count: MAX_RESULTS })}</p>}
    </div>
  )
}

// La scelta completa del carattere, identica nelle impostazioni generali e in quelle di progetto: tipo di sistema + set di Google Fonts (e catalogo).
// `allowDefault`: aggiunge "predefinito" (font e fontFamily vuoti), per l'override di progetto.
export function EditorFontChoice({ font, fontFamily, onChange, allowDefault = false }) {
  const options = allowDefault ? [{ value: '', label: t('Default (general settings)') }, ...genericFonts] : genericFonts
  return (
    <div className="grid gap-4">
      <Segmented label={t('System font')} options={options} value={fontFamily ? null : font} onChange={(next) => onChange({ font: next, fontFamily: '' })} />
      <div className="grid gap-2">
        <span className="text-sm text-slate-300">{t('Google Fonts')}</span>
        <FontPicker family={fontFamily} onSelect={(family, category) => onChange({ font: category, fontFamily: family })} />
      </div>
    </div>
  )
}

// Set ristretto di Google Fonts inclusi nell'app, più quelli installati dal catalogo.
export default function FontPicker({ family, onSelect }) {
  const [installed, setInstalled] = useState(getInstalledFonts)
  const [browsing, setBrowsing] = useState(false)
  useEffect(() => subscribeFonts(setInstalled), [])
  useEffect(() => { curatedFonts.forEach((font) => loadFamily(font.family)) }, [])

  const curatedNames = new Set(curatedFonts.map((font) => font.family))
  const extra = installed.filter((font) => !curatedNames.has(font.family))
  const installedNames = new Set(installed.map((font) => font.family))

  async function remove(font) {
    await removeFont(font.family)
    if (family === font.family) onSelect('', 'sans')
  }

  return (
    <div className="grid gap-3">
      <div role="radiogroup" aria-label={t('Google Fonts')} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[...curatedFonts, ...extra].map((font) => (
          <FontCard key={font.family} font={font} selected={family === font.family} onSelect={() => onSelect(font.family, font.category === 'other' ? 'sans' : font.category)} onRemove={curatedNames.has(font.family) ? null : () => remove(font)} />
        ))}
      </div>
      {hasCatalog && (
        <div className="grid gap-3">
          <button type="button" className="w-fit rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800 hover:text-slate-50" onClick={() => setBrowsing((value) => !value)}>
            {browsing ? t('Close catalog') : t('Browse the Google Fonts catalog…')}
          </button>
          {browsing && <Catalog installedNames={installedNames} />}
        </div>
      )}
    </div>
  )
}
