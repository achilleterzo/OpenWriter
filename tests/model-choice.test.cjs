const test = require('node:test')
const assert = require('node:assert/strict')
const { cleanModelChoice, applyModelChoice } = require('../electron/model-choice.cjs')

const general = {
  aiEnabled: true,
  provider: 'ollama',
  providers: {
    ollama: { model: 'llama3', reasoning: 'default', endpoint: 'http://localhost:11434' },
    openrouter: { model: 'x/y', reasoning: 'medium' },
    claude: { model: '', reasoning: 'default' },
  },
}
const reasoningLevels = { ollama: ['default', 'low'], openrouter: ['default', 'low', 'medium'], claude: ['default', 'low'] }

test('model-choice: senza provider valido non c\'è nessuna scelta; il testo si ripulisce', () => {
  assert.equal(cleanModelChoice(null), null)
  assert.equal(cleanModelChoice({ provider: 'nope', model: 'a' }), null)
  assert.deepEqual(cleanModelChoice({ provider: 'openrouter', model: '  a/b\n', reasoning: 'low' }), { provider: 'openrouter', model: 'a/b', reasoning: 'low', params: {} })
})

test('model-choice: la scelta cambia provider, modello e ragionamento, e lascia endpoint e il resto delle impostazioni generali', () => {
  const result = applyModelChoice(general, { provider: 'openrouter', model: 'z/w', reasoning: 'low' }, { reasoningLevels })
  assert.equal(result.provider, 'openrouter')
  assert.equal(result.providers.openrouter.model, 'z/w')
  assert.equal(result.providers.openrouter.reasoning, 'low')
  assert.equal(result.providers.ollama.endpoint, 'http://localhost:11434')
  assert.equal(general.provider, 'ollama', 'le impostazioni generali non si toccano')
})

test('model-choice: modello vuoto e ragionamento sconosciuto lasciano i valori generali del provider', () => {
  const result = applyModelChoice(general, { provider: 'openrouter', model: '', reasoning: 'ultra' }, { reasoningLevels })
  assert.equal(result.providers.openrouter.model, 'x/y')
  assert.equal(result.providers.openrouter.reasoning, 'medium')
})

test('model-choice: un provider non utilizzabile su questo computer lascia le impostazioni generali', () => {
  const result = applyModelChoice(general, { provider: 'openrouter', model: 'z/w' }, { reasoningLevels, usable: () => false })
  assert.equal(result, general)
})

test('model-choice: i parametri del progetto prevalgono su quelli generali; un valore fuori misura si porta nei limiti', () => {
  const clean = cleanModelChoice({ provider: 'ollama', model: 'm', params: { numCtx: 100, numPredict: '', keepAlive: 'abc', sandbox: 'nope', endpoint: 'http://evil' } })
  assert.deepEqual(clean.params, { numCtx: 512, numPredict: '', keepAlive: '' })
  const result = applyModelChoice({ ...general, providers: { ...general.providers, ollama: { ...general.providers.ollama, numCtx: 8192 } } }, { provider: 'ollama', model: '', params: { numCtx: 16384 } }, { reasoningLevels })
  assert.equal(result.providers.ollama.numCtx, 16384)
  assert.equal(result.providers.ollama.endpoint, 'http://localhost:11434', "l'endpoint resta quello generale")
})
