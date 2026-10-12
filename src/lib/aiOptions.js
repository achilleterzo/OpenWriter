// Livelli di ragionamento ("sforzo") offerti da ciascun provider; il primo è il predefinito.
const ollamaReasoning = [
  { value: 'instant', label: 'Istantaneo' },
  { value: 'low', label: 'Basso' },
  { value: 'medium', label: 'Medio' },
  { value: 'high', label: 'Alto' },
]
const defaultReasoning = { value: 'default', label: 'Predefinito del client' }

export const reasoningByProvider = {
  ollama: ollamaReasoning,
  'ollama-cloud': ollamaReasoning,
  codex: [defaultReasoning, ...ollamaReasoning.slice(1), { value: 'xhigh', label: 'Molto alto' }],
  claude: [defaultReasoning, ...ollamaReasoning.slice(1), { value: 'xhigh', label: 'Molto alto' }, { value: 'max', label: 'Massimo' }],
}
