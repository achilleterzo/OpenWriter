import { useEffect, useState } from 'react'
import { Check, FolderCog } from 'lucide-react'
import SpellcheckLanguages from './SpellcheckLanguages.jsx'
import { formatNumber } from '../i18n/index.js'
import { t } from '../i18n/index.js'

const electronAPI = window.electronAPI
const languages = ['Italiano', 'English', 'Español', 'Français', 'Deutsch', 'Português']
const fieldClass = 'mt-2 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2.5 text-slate-100 outline-none placeholder:text-slate-500 focus:border-accent-400'

export default function ProjectSettings({ project }) {
  const [form, setForm] = useState(null)
  const [spellcheck, setSpellcheck] = useState({ available: [], global: [] })
  const [info, setInfo] = useState({ available: false })
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    electronAPI.getSpellcheck().then(setSpellcheck)
  }, [])

  useEffect(() => {
    if (!project) { setInfo({ available: false }); setForm(null); return }
    electronAPI.getProjectSettings().then((settings) => {
      setInfo(settings)
      setForm({ name: settings.name, language: settings.ai.language, context: settings.ai.context, autoVersions: settings.options.autoVersions, spellcheck: settings.spellcheck.languages })
    }).catch((reason) => setError(reason.message))
  }, [project])

  function update(changes) {
    setSaved(false)
    setForm((current) => ({ ...current, ...changes }))
  }

  async function save() {
    try {
      const result = await electronAPI.saveProjectSettings({ name: form.name, ai: { context: form.context, language: form.language }, options: { autoVersions: form.autoVersions }, spellcheck: { languages: form.spellcheck } })
      setInfo(result)
      setSaved(true)
      setError('')
    } catch (reason) {
      setError(reason.message)
    }
  }

  const contextLength = formatNumber(form?.context.length ?? 0)
  const contextLimit = formatNumber(20000)

  if (!project) return <p className="text-sm text-slate-400">{t('Open a project folder to configure its settings.')}</p>
  if (error && !form) return <p className="text-sm text-rose-400">{error}</p>
  if (!form) return null

  return (
    <section className="grid gap-5 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
      <div>
        <div className="flex items-center gap-2">
          <FolderCog className="text-accent-400" size={20} />
          <h2 className="text-lg font-semibold">{t('Project settings')}</h2>
        </div>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">{t('Saved in the project\'s .ow folder, together with the version history: you can version it or copy it along with the project.')}</p>
      </div>

      <label className="text-sm text-slate-300">{t('Project name')}<input value={form.name} maxLength={200} className={fieldClass} placeholder={t('Optional')} onChange={(event) => update({ name: event.target.value })} />
      </label>

      <label className="text-sm text-slate-300">{t('Context for the AI')}<textarea
          value={form.context}
          rows={9}
          className={`${fieldClass} resize-y font-mono text-sm leading-6`}
          placeholder={t('Describe the project: audience, tone of voice, glossary, style rules…\nThe assistant receives it in every conversation.')}
          onChange={(event) => update({ context: event.target.value })}
        />
        <span className="mt-1 block text-xs text-slate-500">{t('Saved in .ow/context.md, so you can also edit it by hand. {contextLength} / {contextLimit} characters.', { contextLength, contextLimit })}</span>
      </label>

      <label className="text-sm text-slate-300">{t('AI reply language in this project')}<select className={fieldClass} value={form.language} onChange={(event) => update({ language: event.target.value })}>
          <option value="">{t('Default (AI settings)')}</option>
          {[...new Set([...languages, form.language].filter(Boolean))].map((language) => <option key={language} value={language}>{language}</option>)}
        </select>
      </label>

      <div className="grid gap-2 text-sm text-slate-300">
        <span>{t('Spell checker languages in this project')}</span>
        <SpellcheckLanguages
          available={spellcheck.available}
          value={form.spellcheck}
          emptyHint={t('Default: {value}', { value: spellcheck.global.join(', ') || t('None') })}
          onChange={(languages) => update({ spellcheck: languages })}
        />
        <span className="text-xs text-slate-500">{t('If you choose none, the ones from the general settings apply.')}</span>
      </div>

      <label className="flex items-start gap-3 text-sm text-slate-300">
        <input type="checkbox" checked={form.autoVersions} className="mt-1 accent-accent-500" onChange={(event) => update({ autoVersions: event.target.checked })} />
        <span>{t('Save a version on every save')}<span className="block text-xs text-slate-500">{t('If the text changed. At most 100 versions are kept per document; the oldest automatic ones are discarded first.')}</span>
        </span>
      </label>

      <div className="flex items-center gap-3">
        <button type="button" className="rounded-md bg-accent-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-500" onClick={save}>{t('Save settings')}</button>
        {saved && <span className="flex items-center gap-1 text-sm text-emerald-400"><Check size={15} /> {t('Saved')}</span>}
        {error && <span className="text-sm text-rose-400">{error}</span>}
      </div>
    </section>
  )
}
