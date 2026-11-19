// Descrittori dei provider che parlano il protocollo "openai-chat" (POST {baseUrl}/chat/completions in streaming SSE).
// Un descrittore è solo dati, senza codice: dove arrivare, come passare il token e con quali nomi di parametro. Come si leggono
// le risposte lo sa il codec (openai-chat.cjs), uguale per tutti i servizi. Aggiungere un servizio compatibile = aggiungere un blocco qui.
//
//   protocol        codec che parla con il servizio
//   label           nome mostrato e usato nei messaggi
//   baseUrl         radice dell'API (senza barra finale)
//   headers         intestazioni fisse oltre a Accept e al token Bearer
//   reasoningParam  percorso (a punti) del corpo dove va il livello di ragionamento; assente = il servizio non lo riceve
//   usage           frammento di corpo che chiede il conteggio dei token nello stream
//   whenFiles       frammento di corpo aggiunto solo se la richiesta contiene PDF; assente = il servizio non li legge
//   models          come si legge l'elenco: { catalog } = il catalogo pubblico con le capacità di ogni modello;
//                   altrimenti { stripPrefix, include, exclude } (espressioni regolari come testo) per ripulire gli id di /models
//   capabilities    'catalog' (dal catalogo), 'manual' (le dichiara l'utente) oppure { vision, tools, pdf } valide per ogni modello del servizio

const OPENAI_DESCRIPTORS = {
  openrouter: {
    protocol: 'openai-chat',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    headers: { 'X-Title': 'OpenWriter' },
    reasoningParam: 'reasoning.effort',
    usage: { usage: { include: true } },
    // I PDF si leggono in modo nativo, senza l'estrazione del testo che OpenRouter farebbe da sé.
    whenFiles: { plugins: [{ id: 'file-parser', pdf: { engine: 'native' } }] },
    models: { catalog: true },
    capabilities: 'catalog',
  },
  // Google AI Studio con il protocollo compatibile OpenAI. I PDF non passano da questo endpoint.
  gemini: {
    protocol: 'openai-chat',
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    headers: {},
    reasoningParam: 'reasoning_effort',
    usage: { stream_options: { include_usage: true } },
    // Solo i modelli che generano testo (esclusi embedding, immagini, audio, ecc.): gli id arrivano come "models/gemini-…".
    models: { stripPrefix: '^models/', include: '^gemini-', exclude: 'embedding|image|tts|audio|live|robotics|computer-use|aqa' },
    capabilities: { vision: true, tools: true, pdf: false },
  },
}

// Preset del provider "openai" (server compatibili OpenAI a scelta dell'utente). Ognuno ha l'indirizzo predefinito, se il token è obbligatorio
// dove va il livello di ragionamento (assente: il servizio non lo riceve) e dove si crea la chiave (`keyUrl`, solo per i servizi ospitati). Per tutti i preset: il token è Bearer, i token consumati si chiedono con
// stream_options, l'elenco modelli è quello di /models e le capacità (immagini, strumenti) le dichiara l'utente, perché un server generico non le dice.
const OPENAI_PRESETS = {
  lmstudio: { label: 'LM Studio', baseUrl: 'http://localhost:1234/v1', keyRequired: false },
  llamacpp: { label: 'llama.cpp', baseUrl: 'http://localhost:8080/v1', keyRequired: false },
  vllm: { label: 'vLLM', baseUrl: 'http://localhost:8000/v1', keyRequired: false },
  openai: { label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', keyRequired: true, reasoningParam: 'reasoning_effort', keyUrl: 'https://platform.openai.com/api-keys' },
  groq: { label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', keyRequired: true, reasoningParam: 'reasoning_effort', keyUrl: 'https://console.groq.com/keys' },
  together: { label: 'Together AI', baseUrl: 'https://api.together.xyz/v1', keyRequired: true, keyUrl: 'https://api.together.ai/settings/api-keys' },
  mistral: { label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', keyRequired: true, keyUrl: 'https://console.mistral.ai/api-keys' },
  deepseek: { label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', keyRequired: true, keyUrl: 'https://platform.deepseek.com/api_keys' },
  // Indirizzo libero, token facoltativo: può essere un server in rete locale senza autenticazione.
  custom: { label: 'OpenAI-compatible', baseUrl: '', keyRequired: false },
}
const DEFAULT_OPENAI_PRESET = 'lmstudio'

// Descrittore completo di un preset, con l'indirizzo scelto (quello del preset, se non ne è dato un altro) e il nome dato dall'utente (altrimenti quello del preset).
function presetDescriptor(presetId, baseUrl = '', name = '') {
  const preset = OPENAI_PRESETS[presetId] || OPENAI_PRESETS[DEFAULT_OPENAI_PRESET]
  return {
    protocol: 'openai-chat',
    label: String(name || '').trim() || preset.label,
    baseUrl: String(baseUrl || preset.baseUrl).replace(/\/+$/, ''),
    headers: {},
    ...(preset.reasoningParam ? { reasoningParam: preset.reasoningParam } : {}),
    usage: { stream_options: { include_usage: true } },
    models: {},
    capabilities: 'manual',
  }
}

// Un provider compatibile OpenAI è un server scelto dall'utente: il primo ha id "openai", gli altri "openai-<codice>" (lettere e cifre). Ognuno ha
// nome, indirizzo, chiave e capacità propri, e vale come un provider a sé ovunque (scelta del progetto, conversazione, ricerca).
const COMPATIBLE_ID = /^openai(?:-[a-z0-9]{4,12})?$/
const isCompatibleProvider = (id) => typeof id === 'string' && COMPATIBLE_ID.test(id)
const MAX_COMPATIBLE_PROVIDERS = 20

module.exports = { OPENAI_DESCRIPTORS, OPENAI_PRESETS, DEFAULT_OPENAI_PRESET, presetDescriptor, isCompatibleProvider, MAX_COMPATIBLE_PROVIDERS }
