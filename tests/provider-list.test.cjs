const test = require('node:test')
const assert = require('node:assert/strict')
const { normalizeSettings } = require('../electron/ai-providers.cjs')

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='

test('provider attivi: una nuova installazione mostra solo il provider scelto', () => {
  assert.deepEqual(normalizeSettings().activeProviders, ['ollama'])
  assert.deepEqual(normalizeSettings({ provider: 'claude' }).activeProviders, ['claude'])
})

test('provider attivi: le impostazioni di prima restano visibili per i provider già usati (con un modello) e per quello scelto', () => {
  const settings = normalizeSettings({
    provider: 'ollama',
    providers: { 'ollama-cloud': { model: 'gpt-oss' }, gemini: { model: 'gemini-2.5-pro' }, openrouter: { model: '' } },
  })
  assert.deepEqual(settings.activeProviders, ['ollama', 'ollama-cloud', 'gemini'])
})

test('provider attivi: l\'elenco salvato si rispetta, ma il provider scelto c\'è sempre e i nomi sconosciuti spariscono', () => {
  const settings = normalizeSettings({ provider: 'openai', activeProviders: ['gemini', 'inventato', 'gemini', 'claude'] })
  assert.deepEqual(settings.activeProviders, ['openai', 'gemini', 'claude'])
  // Togliere un provider dall'elenco ne tiene la configurazione.
  const kept = normalizeSettings({ provider: 'ollama', activeProviders: ['ollama'], providers: { gemini: { model: 'g' } } })
  assert.deepEqual(kept.activeProviders, ['ollama'])
  assert.equal(kept.providers.gemini.model, 'g')
  assert.deepEqual(normalizeSettings({ provider: 'ollama', activeProviders: [] }).activeProviders, ['ollama'])
})

test('icone dei provider: solo i provider personalizzati, solo immagini PNG, JPEG o WebP e di dimensione contenuta', () => {
  const icons = normalizeSettings({
    providerIcons: {
      gemini: PNG,
      openai: 'data:image/jpeg;base64,/9j/4AAQ',
      'ollama-cloud': PNG,
      claude: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      codex: 'https://esempio.it/icona.png',
      ollama: `data:image/png;base64,${'A'.repeat(80001)}`,
      inventato: PNG,
      openrouter: 42,
    },
  }).providerIcons
  assert.deepEqual(Object.keys(icons), ['openai'])
  assert.deepEqual(normalizeSettings({ providerIcons: 'x' }).providerIcons, {})
  assert.deepEqual(normalizeSettings().providerIcons, {})
})

test('provider attivi: il primo server compatibile tolto dalle impostazioni torna vuoto e resta fuori dall\'elenco finché non lo si riaggiunge', () => {
  const settings = normalizeSettings({ provider: 'ollama', providers: { ollama: { model: 'm' } }, activeProviders: ['ollama'] })
  assert.deepEqual(settings.activeProviders, ['ollama'])
  assert.equal(settings.providers.openai.model, '')
  assert.equal(settings.providers.openai.name, '')
  assert.equal(settings.providers.openai.preset, 'lmstudio')
})
