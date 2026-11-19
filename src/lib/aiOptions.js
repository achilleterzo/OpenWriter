import { t } from '../i18n/index.js'
// Livelli di ragionamento ("sforzo") offerti da ciascun provider; il primo è il predefinito.
const ollamaReasoning = [
  { value: 'instant', label: t('Instant') },
  { value: 'low', label: t('Low') },
  { value: 'medium', label: t('Medium') },
  { value: 'high', label: t('High') },
]
const defaultReasoning = { value: 'default', label: t('Client default') }

// Nome con cui ogni gruppo di strumenti compare nelle impostazioni AI (Strumenti dell'assistente).
export const toolLabels = () => ({
  files: t('Project files'),
  create: t('Creating files and folders'),
  memory: t('Memory'),
  notes: t('Notes in the document'),
  edit: t('Editing the open document'),
  ask: t('Questions with choices'),
  vision: t('Images and screenshots'),
  web: t('Web browsing'),
})

// Un server compatibile OpenAI è un provider a sé: il primo ha id "openai", gli altri "openai-<codice>" (stessa regola di provider-descriptors.cjs).
export const isCompatibleId = (id) => /^openai(?:-[a-z0-9]{4,12})?$/.test(String(id || ''))
// Id per un nuovo server compatibile.
export const newServerId = () => `openai-${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`

const reasoningTable = {
  ollama: ollamaReasoning,
  'ollama-cloud': ollamaReasoning,
  openrouter: [defaultReasoning, ...ollamaReasoning.slice(1)],
  codex: [defaultReasoning, ...ollamaReasoning.slice(1), { value: 'xhigh', label: t('Very high') }],
  gemini: [defaultReasoning, ...ollamaReasoning.slice(1)],
  openai: [defaultReasoning, ...ollamaReasoning.slice(1)],
  claude: [defaultReasoning, ...ollamaReasoning.slice(1), { value: 'xhigh', label: t('Very high') }, { value: 'max', label: t('Maximum') }],
}
// I server compatibili aggiunti dall'utente hanno gli stessi livelli di "openai".
export const reasoningByProvider = new Proxy(reasoningTable, { get: (table, key) => table[key] ?? (isCompatibleId(key) ? table.openai : undefined) })
