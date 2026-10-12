import { X } from 'lucide-react'
import { intlLocale, languageName } from '../i18n/index.js'
import { t } from '../i18n/index.js'

export function languageLabel(code) {
  return `${languageName(code)} (${code})`
}

// Selettore multiplo: lingue scelte come etichette removibili e menu per aggiungerne altre.
export default function SpellcheckLanguages({ available, value, onChange, emptyHint }) {
  const addable = available.filter((code) => !value.includes(code)).sort((left, right) => languageLabel(left).localeCompare(languageLabel(right), intlLocale()))

  if (!available.length) {
    return <p className="text-sm text-slate-500">{t('The spell checker is managed by the operating system.')}</p>
  }

  return (
    <div className="grid gap-2">
      <div className="flex min-h-9 flex-wrap items-center gap-2">
        {value.map((code) => (
          <span key={code} className="flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800 py-1 pl-3 pr-1.5 text-sm text-slate-200">
            {languageLabel(code)}
            <button type="button" aria-label={t('Remove {languageLabel}', { languageLabel: languageLabel(code) })} className="rounded-full p-0.5 text-slate-500 hover:bg-slate-700 hover:text-slate-50" onClick={() => onChange(value.filter((item) => item !== code))}><X size={13} /></button>
          </span>
        ))}
        {!value.length && <span className="text-sm text-slate-500">{emptyHint}</span>}
      </div>
      <select
        aria-label={t('Add language')}
        value=""
        disabled={!addable.length}
        className="w-full max-w-xs rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent-400 disabled:opacity-60"
        onChange={(event) => event.target.value && onChange([...value, event.target.value])}
      >
        <option value="">{t('Add language…')}</option>
        {addable.map((code) => <option key={code} value={code}>{languageLabel(code)}</option>)}
      </select>
    </div>
  )
}
