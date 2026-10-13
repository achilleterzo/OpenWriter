import { t } from '../i18n/index.js'
// Livelli di ragionamento ("sforzo") offerti da ciascun provider; il primo è il predefinito.
const ollamaReasoning = [
  { value: 'instant', label: t('Instant') },
  { value: 'low', label: t('Low') },
  { value: 'medium', label: t('Medium') },
  { value: 'high', label: t('High') },
]
const defaultReasoning = { value: 'default', label: t('Client default') }

export const reasoningByProvider = {
  ollama: ollamaReasoning,
  'ollama-cloud': ollamaReasoning,
  openrouter: [defaultReasoning, ...ollamaReasoning.slice(1)],
  codex: [defaultReasoning, ...ollamaReasoning.slice(1), { value: 'xhigh', label: t('Very high') }],
  claude: [defaultReasoning, ...ollamaReasoning.slice(1), { value: 'xhigh', label: t('Very high') }, { value: 'max', label: t('Maximum') }],
}
