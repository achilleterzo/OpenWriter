import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Bot, FolderCog, Palette, Settings2, SlidersHorizontal } from 'lucide-react'
import AiProviderSettings from './AiProviderSettings.jsx'
import AppearanceSettings from './AppearanceSettings.jsx'
import GeneralSettings from './GeneralSettings.jsx'
import ProjectSettings from './ProjectSettings.jsx'

// Per aggiungere una sezione basta una nuova voce qui.
const sections = [
  { id: 'general', label: 'Generale', icon: SlidersHorizontal },
  { id: 'project', label: 'Progetto', icon: FolderCog },
  { id: 'appearance', label: 'Aspetto', icon: Palette },
  { id: 'ai', label: 'AI', icon: Bot },
]

export default function SettingsScreen({ project, onChooseProject, onBack }) {
  const [section, setSection] = useState('general')
  const current = sections.find((item) => item.id === section)
  const pressedOnBackdrop = useRef(false)

  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === 'Escape') onBack() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onBack])

  return (
    // Si chiude solo se click e rilascio avvengono entrambi sullo sfondo: trascinare una selezione fuori dal pannello non deve chiuderlo.
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/75 p-4 text-slate-100 backdrop-blur-sm sm:p-8"
      onMouseDown={(event) => { pressedOnBackdrop.current = event.target === event.currentTarget }}
      onClick={(event) => { if (pressedOnBackdrop.current && event.target === event.currentTarget) onBack() }}
    >
      <section role="dialog" aria-modal="true" aria-labelledby="settings-title" className="flex h-[min(760px,calc(100vh-2rem))] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <header className="flex items-center gap-4 border-b border-slate-800 px-6 py-5">
          <button
            type="button"
            aria-label="Torna al documento"
            title="Torna al documento"
            className="rounded-md p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-50"
            onClick={onBack}
          >
            <ArrowLeft size={19} />
          </button>
          <div>
            <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.25em] text-accent-400">
              <Settings2 size={15} /> Impostazioni
            </p>
            <h1 id="settings-title" className="mt-1 text-2xl font-semibold tracking-tight">{current.label}</h1>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav role="tablist" aria-orientation="vertical" aria-label="Sezioni delle impostazioni" className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-800 p-3 sm:w-52 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r">
            {sections.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={section === id}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${section === id ? 'bg-accent-500/15 font-medium text-accent-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-50'}`}
                onClick={() => setSection(id)}
              >
                <Icon size={17} /> {label}
              </button>
            ))}
          </nav>

          <div role="tabpanel" className="min-w-0 flex-1 overflow-y-auto p-6 sm:p-8">
            {section === 'general' && <GeneralSettings project={project} onChooseProject={onChooseProject} />}
            {section === 'project' && <ProjectSettings project={project} />}
            {section === 'appearance' && <AppearanceSettings />}
            {section === 'ai' && <AiProviderSettings />}
          </div>
        </div>
      </section>
    </div>
  )
}
