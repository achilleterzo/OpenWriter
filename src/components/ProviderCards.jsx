import { t } from '../i18n/index.js'
import ollamaLogo from '../assets/provider-logos/ollama.svg'
import openRouterLogo from '../assets/provider-logos/openrouter.svg'
import codexLogo from '../assets/provider-logos/codex.svg'
import claudeCodeLogo from '../assets/provider-logos/claude-code.svg'
import geminiLogo from '../assets/provider-logos/gemini.svg'

// I provider AI tra cui scegliere, con il logo: la scelta generale (AiProviderSettings) e quella di un progetto (AiProviderSettings con `project`) usano le stesse schede.
export const providers = [
  { value: 'ollama', label: 'Ollama', description: t('Local HTTP service') },
  { value: 'ollama-cloud', label: 'Ollama Cloud', description: t('Hosted API with an API key') },
  { value: 'openrouter', label: 'OpenRouter', description: t('Hundreds of models with one API key') },
  { value: 'codex', label: 'Codex', description: t('Native CLI with ChatGPT OAuth') },
  { value: 'claude', label: 'Claude', description: t('Native CLI with Claude OAuth') },
  { value: 'gemini', label: 'Gemini', description: t('Google AI Studio API key') },
]
export const logos = { ollama: ollamaLogo, 'ollama-cloud': ollamaLogo, openrouter: openRouterLogo, codex: codexLogo, claude: claudeCodeLogo, gemini: geminiLogo }

export default function ProviderCards({ value, onChange }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t('AI provider')}>
      {providers.map((option) => {
        const active = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            className={`flex min-w-0 items-center gap-3 rounded-lg border px-3 py-3 text-left transition ${active ? 'border-teal-700 bg-teal-950/60 text-teal-300 ring-1 ring-inset ring-teal-900' : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:bg-slate-800 hover:text-slate-100'}`}
            onClick={() => onChange(option.value)}
          >
            <img src={logos[option.value]} alt="" aria-hidden="true" className="h-7 w-7 shrink-0 rounded-md bg-stone-100 object-contain p-1" />
            <span className="grid min-w-0 gap-0.5">
              <strong className="truncate text-sm font-semibold">{option.label}</strong>
              <small className={`truncate text-xs ${active ? 'text-teal-200/70' : 'text-slate-500'}`}>{option.description}</small>
            </span>
          </button>
        )
      })}
    </div>
  )
}
