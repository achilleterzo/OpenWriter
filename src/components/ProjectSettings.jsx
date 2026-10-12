import { useEffect, useState } from 'react'
import { Check, FolderCog } from 'lucide-react'
import SpellcheckLanguages from './SpellcheckLanguages.jsx'

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

  if (!project) return <p className="text-sm text-slate-400">Apri una cartella di progetto per configurarne le impostazioni.</p>
  if (error && !form) return <p className="text-sm text-rose-400">{error}</p>
  if (!form) return null

  return (
    <section className="grid gap-5 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
      <div>
        <div className="flex items-center gap-2">
          <FolderCog className="text-accent-400" size={20} />
          <h2 className="text-lg font-semibold">Impostazioni del progetto</h2>
        </div>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
          Salvate nella cartella <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-300">.ow</code> del progetto, insieme alla cronologia delle versioni: puoi versionarla o copiarla con il progetto.
        </p>
      </div>

      <label className="text-sm text-slate-300">
        Nome del progetto
        <input value={form.name} maxLength={200} className={fieldClass} placeholder="Facoltativo" onChange={(event) => update({ name: event.target.value })} />
      </label>

      <label className="text-sm text-slate-300">
        Contesto per l&apos;AI
        <textarea
          value={form.context}
          rows={9}
          className={`${fieldClass} resize-y font-mono text-sm leading-6`}
          placeholder={'Descrivi il progetto: pubblico, tono di voce, glossario, regole di stile…\nL\'assistente lo riceve a ogni conversazione.'}
          onChange={(event) => update({ context: event.target.value })}
        />
        <span className="mt-1 block text-xs text-slate-500">Salvato in <code>.ow/context.md</code>, quindi puoi anche modificarlo a mano. {form.context.length.toLocaleString('it')} / 20.000 caratteri.</span>
      </label>

      <label className="text-sm text-slate-300">
        Lingua delle risposte AI in questo progetto
        <select className={fieldClass} value={form.language} onChange={(event) => update({ language: event.target.value })}>
          <option value="">Predefinita (impostazioni AI)</option>
          {[...new Set([...languages, form.language].filter(Boolean))].map((language) => <option key={language} value={language}>{language}</option>)}
        </select>
      </label>

      <div className="grid gap-2 text-sm text-slate-300">
        <span>Lingue del correttore ortografico in questo progetto</span>
        <SpellcheckLanguages
          available={spellcheck.available}
          value={form.spellcheck}
          emptyHint={`Predefinite: ${spellcheck.global.join(', ') || 'nessuna'}`}
          onChange={(languages) => update({ spellcheck: languages })}
        />
        <span className="text-xs text-slate-500">Se non ne scegli nessuna valgono quelle delle impostazioni generali.</span>
      </div>

      <label className="flex items-start gap-3 text-sm text-slate-300">
        <input type="checkbox" checked={form.autoVersions} className="mt-1 accent-accent-500" onChange={(event) => update({ autoVersions: event.target.checked })} />
        <span>
          Salva una versione a ogni salvataggio
          <span className="block text-xs text-slate-500">Se il testo è cambiato. Si conservano al massimo 100 versioni per documento; le automatiche più vecchie vengono scartate per prime.</span>
        </span>
      </label>

      <div className="flex items-center gap-3">
        <button type="button" className="rounded-md bg-accent-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-500" onClick={save}>Salva impostazioni</button>
        {saved && <span className="flex items-center gap-1 text-sm text-emerald-400"><Check size={15} /> Salvato</span>}
        {error && <span className="text-sm text-rose-400">{error}</span>}
      </div>
    </section>
  )
}
