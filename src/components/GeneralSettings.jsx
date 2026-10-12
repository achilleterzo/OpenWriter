import { useEffect, useState } from 'react'
import { FolderOpen, SpellCheck2 } from 'lucide-react'
import SpellcheckLanguages from './SpellcheckLanguages.jsx'

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
    <div className="grid gap-6">
      <section className="grid gap-4 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
        <div className="flex items-center gap-2">
          <FolderOpen className="text-accent-400" size={20} />
          <h2 className="text-lg font-semibold">Progetto</h2>
        </div>
        <p className="max-w-xl text-sm leading-6 text-slate-400">
          La cartella del progetto è la directory di lavoro: l&apos;esplora risorse mostra i suoi documenti e l&apos;assistente AI lavora da lì. Ogni progetto ricorda le proprie schede aperte e le bozze non salvate.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate rounded-md border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-300" title={project || ''}>{project || 'Nessun progetto aperto'}</code>
          <button type="button" className="rounded-md bg-slate-700 px-4 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-slate-600" onClick={onChooseProject}>
            {project ? 'Cambia cartella' : 'Apri cartella'}
          </button>
        </div>
      </section>

      {spellcheck && (
        <section className="grid gap-4 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
          <div className="flex items-center gap-2">
            <SpellCheck2 className="text-accent-400" size={20} />
            <h2 className="text-lg font-semibold">Correttore ortografico</h2>
          </div>
          <p className="max-w-xl text-sm leading-6 text-slate-400">
            Lingue usate per sottolineare gli errori nell&apos;editor e nella chat. Ogni progetto può sceglierne altre in Impostazioni → Progetto. I dizionari vengono scaricati al primo utilizzo.
          </p>
          <SpellcheckLanguages available={spellcheck.available} value={spellcheck.global} emptyHint="Nessuna lingua: il correttore è disattivato." onChange={changeLanguages} />
        </section>
      )}
    </div>
  )
}
