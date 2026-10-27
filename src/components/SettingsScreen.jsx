import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Bot, FolderCog, Info, Palette, Plug, Settings2, SlidersHorizontal, Wand2, Zap } from 'lucide-react'
import AboutSettings from './AboutSettings.jsx'
import AiProviderSettings from './AiProviderSettings.jsx'
import AppearanceSettings from './AppearanceSettings.jsx'
import GeneralSettings from './GeneralSettings.jsx'
import McpSettings from './McpSettings.jsx'
import QuickActionsSettings from './QuickActionsSettings.jsx'
import ProjectSettings from './ProjectSettings.jsx'
import SkillsManager from './SkillsManager.jsx'
import { t } from '../i18n/index.js'

// Per aggiungere una sezione basta una nuova voce qui.
const sections = [
  { id: 'general', label: t('General'), icon: SlidersHorizontal },
  { id: 'project', label: t('Project'), icon: FolderCog },
  { id: 'appearance', label: t('Appearance'), icon: Palette },
  { id: 'ai', label: 'AI', icon: Bot },
  { id: 'actions', label: t('Quick actions'), icon: Zap },
  { id: 'skills', label: t('Skills'), icon: Wand2 },
  { id: 'agents', label: t('Agents (MCP)'), icon: Plug },
  { id: 'about', label: t('About'), icon: Info },
]

export default function SettingsScreen({ initialSection = 'general', project, onMoveProject, onChooseProject, onBack, onOpenFile, version, release, onCheckUpdate }) {
  const [section, setSection] = useState(initialSection)
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
            aria-label={t('Back to the document')}
            title={t('Back to the document')}
            className="rounded-md p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-50"
            onClick={onBack}
          >
            <ArrowLeft size={19} />
          </button>
          <div>
            <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.25em] text-accent-400">
              <Settings2 size={15} /> {t('Settings')}</p>
            <h1 id="settings-title" className="mt-1 text-2xl font-semibold tracking-tight">{current.label}</h1>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav role="tablist" aria-orientation="vertical" aria-label={t('Settings sections')} className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-800 p-3 sm:w-52 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r">
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

          <div role="tabpanel" className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-6 sm:p-8">
            {section === 'general' && <GeneralSettings project={project} onChooseProject={onChooseProject} />}
            {section === 'project' && <ProjectSettings project={project} onEditContext={onOpenFile} onMove={onMoveProject} />}
            {section === 'appearance' && <AppearanceSettings />}
            {section === 'ai' && <AiProviderSettings />}
            {section === 'actions' && <QuickActionsSettings project={project} />}
            {section === 'skills' && (
              <section className="grid grid-cols-1 gap-4 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
                <p className="max-w-xl text-sm leading-6 text-slate-400">{t('Writing skills collect style, tone of voice and rules that you want to reuse. The ones here are available in every project: activate them by default in the project settings, or add them to a single conversation from the chat.')}</p>
                <SkillsManager scope="global" />
              </section>
            )}
            {section === 'agents' && <McpSettings project={project} />}
            {section === 'about' && <AboutSettings version={version} release={release} onCheck={onCheckUpdate} />}
          </div>
        </div>
      </section>
    </div>
  )
}
