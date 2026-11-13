import { useState } from 'react'
import { Bot, Cpu, FileSymlink, Info, Palette, Plug, Puzzle, SlidersHorizontal, Wand2, Zap } from 'lucide-react'
import AboutSettings from './AboutSettings.jsx'
import AssociationSettings from './AssociationSettings.jsx'
import AiProviderSettings from './AiProviderSettings.jsx'
import AppearanceSettings from './AppearanceSettings.jsx'
import GeneralSettings from './GeneralSettings.jsx'
import LocalModelsSettings from './LocalModelsSettings.jsx'
import McpSettings from './McpSettings.jsx'
import QuickActionsSettings from './QuickActionsSettings.jsx'
import ServicesSettings from './ServicesSettings.jsx'
import SettingsShell from './SettingsShell.jsx'
import SkillsManager from './SkillsManager.jsx'
import { t } from '../i18n/index.js'

// Impostazioni dell'applicazione. Le prime sei schede (generale, aspetto, AI, azioni rapide, skill, servizi) le ha anche la finestra di un progetto (ProjectSettings.jsx),
// con le scelte che valgono solo per quel progetto; il resto è solo qui. Per aggiungere una sezione basta una nuova voce.
const sections = [
  { id: 'general', label: t('General'), icon: SlidersHorizontal },
  { id: 'appearance', label: t('Appearance'), icon: Palette },
  { id: 'ai', label: 'AI', icon: Bot },
  { id: 'actions', label: t('Quick actions'), icon: Zap },
  { id: 'skills', label: t('Skills'), icon: Wand2 },
  { id: 'services', label: t('Services'), icon: Puzzle },
  { id: 'associations', label: t('Associations'), icon: FileSymlink },
  { id: 'models', label: t('Local models'), icon: Cpu },
  { id: 'agents', label: t('Agents (MCP)'), icon: Plug },
  { id: 'about', label: t('About'), icon: Info },
]

export default function SettingsScreen({ initialSection = 'general', project, onBack, version, release, onCheckUpdate }) {
  const [section, setSection] = useState(sections.some((item) => item.id === initialSection) ? initialSection : 'general')

  return (
    <SettingsShell sections={sections} section={section} onSection={setSection} onClose={onBack}>
      {section === 'general' && <GeneralSettings />}
      {section === 'appearance' && <AppearanceSettings />}
      {section === 'ai' && <AiProviderSettings />}
      {section === 'actions' && <QuickActionsSettings />}
      {section === 'skills' && (
        <section className="grid grid-cols-1 gap-4 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
          <p className="max-w-xl text-sm leading-6 text-slate-400">{t('Writing skills collect style, tone of voice and rules that you want to reuse. The ones here are available in every project: activate them by default in the project settings, or add them to a single conversation from the chat.')}</p>
          <SkillsManager scope="global" />
        </section>
      )}
      {section === 'services' && <ServicesSettings />}
      {section === 'associations' && <AssociationSettings />}
      {section === 'models' && <LocalModelsSettings />}
      {section === 'agents' && <McpSettings project={project} />}
      {section === 'about' && <AboutSettings version={version} release={release} onCheck={onCheckUpdate} />}
    </SettingsShell>
  )
}
