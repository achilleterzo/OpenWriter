import { useRef } from 'react'
import { ImagePlus, RotateCcw, X } from 'lucide-react'
import { t } from '../i18n/index.js'
import { isCompatibleId } from '../lib/aiOptions.js'
import ollamaLogo from '../assets/provider-logos/ollama.svg'
import openRouterLogo from '../assets/provider-logos/openrouter.svg'
import codexLogo from '../assets/provider-logos/codex.svg'
import claudeCodeLogo from '../assets/provider-logos/claude-code.svg'
import geminiLogo from '../assets/provider-logos/gemini.svg'
import compatibleLogo from '../assets/provider-logos/openai-compatible.svg'

// I provider AI tra cui scegliere, con il logo: la scelta generale (AiProviderSettings) e quella di un progetto (AiProviderSettings con `project`) usano le stesse schede.
export const providers = [
  { value: 'ollama', label: 'Ollama', description: t('Local or remote HTTP service') },
  { value: 'ollama-cloud', label: 'Ollama Cloud', description: t('Hosted API with an API key') },
  { value: 'openrouter', label: 'OpenRouter', description: t('Hundreds of models with one API key') },
  { value: 'codex', label: 'Codex', description: t('Native CLI with ChatGPT OAuth') },
  { value: 'claude', label: 'Claude', description: t('Native CLI with Claude OAuth') },
  { value: 'gemini', label: 'Gemini', description: t('Google AI Studio API key') },
]
// I server compatibili OpenAI sono provider a parte: ognuno ha la sua scheda (nome, indirizzo e icona propri) e si aggiunge dal menu "+".
export const serverCard = { label: 'OpenAI-compatible', description: t('LM Studio, llama.cpp, vLLM, Groq, OpenAI and others') }
export const logos = { ollama: ollamaLogo, 'ollama-cloud': ollamaLogo, openrouter: openRouterLogo, codex: codexLogo, claude: claudeCodeLogo, gemini: geminiLogo, openai: compatibleLogo }

// Il pulsante di ogni scheda è solo un'icona: senza bordo né sfondo, all'hover cambia soltanto il colore.
const iconButton = 'flex h-5 w-5 items-center justify-center text-slate-500 outline-none transition hover:text-accent-400 focus-visible:text-accent-400'
// Il cambio dell'icona sta sopra l'icona stessa, lontano dalla X di rimozione, così non si confondono; a fianco, se l'icona è stata cambiata, c'è il ripristino.
// I due pulsanti hanno la stessa taglia (32 px, quanto il logo), lo stesso fondo del riquadro di ogni logo (bg-stone-100, in ogni stato, anche al passaggio del mouse)
// e lo stesso segno (20 px): si vede solo il segno sul fondo dell'icona, e il passaggio cambia soltanto il colore del segno. Compaiono passando sul logo.
const logoButton = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-stone-100 text-accent-600 opacity-0 outline-none transition hover:text-accent-500 focus-visible:opacity-100 group-hover/logo:opacity-100'
// Con l'icona cambiata il testo della scheda scorre di un pulsante a destra mentre si è sopra il logo, per non finire sotto il ripristino.
const makeRoom = 'peer-hover/logo:[&>span]:ml-9 peer-focus-within/logo:[&>span]:ml-9 [&>span]:transition-[margin] [&>span]:duration-150'
// Spazio a destra del testo per la X di rimozione.
const removePadding = 'pr-8'

// `items`: i provider da mostrare (di base tutti; le impostazioni mostrano solo quelli aggiunti dall'utente).
// `onRemove`: se c'è, ogni scheda tranne quella scelta ha una X per toglierla dalla lista.
// `labels`: nomi al posto di quelli di base (il provider personalizzato ha il nome scelto dall'utente).
// `icons`: icone personalizzate { provider: data URL } al posto dei loghi; `onPickIcon(provider, file)` le sceglie, `onResetIcon(provider)` torna al logo.
// Pulsanti sopra il logo di un provider personalizzato: cambiare l'icona (copre il logo) e, a fianco, ripristinare quella di base se è stata cambiata.
// Sta prima del pulsante della scheda (è il suo "peer"), così la scheda può reagire al passaggio sul logo.
function LogoActions({ custom, onPick, onReset }) {
  return (
    <div className={`peer/logo group/logo absolute left-3 top-1/2 z-10 flex h-8 -translate-y-1/2 gap-1 ${custom ? 'w-[68px]' : 'w-8'}`}>
      <button type="button" aria-label={t('Change the icon')} title={t('Change the icon')} className={logoButton} onClick={onPick}><ImagePlus size={20} /></button>
      {custom && <button type="button" aria-label={t('Restore the default icon')} title={t('Restore the default icon')} className={logoButton} onClick={onReset}><RotateCcw size={20} /></button>}
    </div>
  )
}

export default function ProviderCards({ value, onChange, items = providers, onRemove = null, icons = {}, onPickIcon = null, onResetIcon = null, labels = {} }) {
  const picker = useRef(null)
  const target = useRef('')
  return (
    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t('AI provider')}>
      {onPickIcon && (
        <input
          ref={picker}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file && target.current) onPickIcon(target.current, file)
          }}
        />
      )}
      {items.map((option) => {
        const active = value === option.value
        const custom = Boolean(icons[option.value])
        const canPick = Boolean(onPickIcon) && isCompatibleId(option.value)
        const canReset = Boolean(onResetIcon) && custom && isCompatibleId(option.value)
        const canRemove = Boolean(onRemove) && !active
        return (
          <div key={option.value} className="group/card relative min-w-0">
            {canPick && <LogoActions custom={canReset} onPick={() => { target.current = option.value; picker.current?.click() }} onReset={() => onResetIcon(option.value)} />}
            <button
              type="button"
              role="radio"
              aria-checked={active}
              className={`flex w-full min-w-0 items-center gap-3 rounded-lg border px-3 py-3 text-left transition ${canReset ? makeRoom : ''} ${active ? 'border-teal-700 bg-teal-950/60 text-teal-300 ring-1 ring-inset ring-teal-900' : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:bg-slate-800 hover:text-slate-100'}`}
              onClick={() => onChange(option.value)}
            >
              <img src={icons[option.value] || logos[option.value] || logos.openai} alt="" aria-hidden="true" className="h-8 w-8 shrink-0 rounded-md bg-stone-100 object-contain p-1" />
              <span className={`grid min-w-0 gap-0.5 ${canRemove ? removePadding : ''}`}>
                <strong className="truncate text-sm font-semibold">{labels[option.value] || option.label}</strong>
                <small className={`truncate text-xs ${active ? 'text-teal-200/70' : 'text-slate-500'}`}>{option.description}</small>
              </span>
            </button>
            {canRemove && (
              <div className="absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center opacity-0 transition focus-within:opacity-100 group-hover/card:opacity-100">
                <button type="button" aria-label={t('Remove from the list')} title={t('Remove from the list')} className={iconButton} onClick={() => onRemove(option.value)}><X size={20} /></button>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
