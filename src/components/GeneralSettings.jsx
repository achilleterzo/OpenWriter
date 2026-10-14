import { useEffect, useState } from 'react'
import { FolderOpen, Languages, SpellCheck2 } from 'lucide-react'
import SpellcheckLanguages from './SpellcheckLanguages.jsx'
import { LANGUAGES, getLanguagePreference, setLanguage, t } from '../i18n/index.js'

const electronAPI = window.electronAPI

export default function GeneralSettings({ project, onChooseProject }) {
  const [spellcheck, setSpellcheck] = useState(null)

  useEffect(() => {
    electronAPI.getSpellcheck().then(setSpellcheck)
  }, [])

  async function changeLanguages(languages) {
    setSpellcheck((current) => ({ ...current, global: languages }))
    setSpellcheck(await electronAPI.setSpellcheckLanguages(languages))
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      <section className="grid grid-cols-1 gap-4 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
        <div className="flex items-center gap-2">
          <Languages className="text-accent-400" size={20} />
          <h2 className="text-lg font-semibold">{t('Language')}</h2>
        </div>
        <p className="max-w-xl text-sm leading-6 text-slate-400">{t('Language of the interface. Changing it reloads the window; your tabs and drafts are kept.')}</p>
        <select
          aria-label={t('Interface language')}
          value={getLanguagePreference()}
          className="w-full max-w-xs rounded-md border border-slate-700 bg-slate-800 px-3 py-2.5 text-slate-100 outline-none focus:border-accent-400"
          onChange={(event) => setLanguage(event.target.value)}
        >
          <option value="auto">{t('Automatic (system language)')}</option>
          {LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.name}</option>)}
        </select>
      </section>

      <section className="grid grid-cols-1 gap-4 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
        <div className="flex items-center gap-2">
          <FolderOpen className="text-accent-400" size={20} />
          <h2 className="text-lg font-semibold">{t('Project')}</h2>
        </div>
        <p className="max-w-xl text-sm leading-6 text-slate-400">{t('The project folder is the working directory: the file explorer shows its documents and the AI assistant works from there. Each project remembers its own open tabs and unsaved drafts.')}</p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate rounded-md border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-300" title={project || ''}>{project || t('No project open')}</code>
          <button type="button" className="rounded-md bg-slate-700 px-4 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-slate-600" onClick={onChooseProject}>
            {project ? t('Change folder') : t('Open folder')}
          </button>
        </div>
      </section>

      {spellcheck && (
        <section className="grid grid-cols-1 gap-4 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
          <div className="flex items-center gap-2">
            <SpellCheck2 className="text-accent-400" size={20} />
            <h2 className="text-lg font-semibold">{t('Spell checker')}</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-slate-400">{t('Languages used to underline mistakes in the editor and in the chat. Each project can choose others in Settings → Project. Dictionaries are downloaded on first use.')}</p>
          <SpellcheckLanguages available={spellcheck.available} value={spellcheck.global} emptyHint={t('No language: the spell checker is off.')} onChange={changeLanguages} />
        </section>
      )}
    </div>
  )
}
