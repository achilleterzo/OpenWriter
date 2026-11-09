const test = require('node:test')
const assert = require('node:assert/strict')

const load = () => import('../src/lib/chatResume.js')
const user = { role: 'user', content: 'riscrivi il capitolo' }
const call = { role: 'assistant', content: '<tool_call>', toolCall: { name: 'replace_text', arguments: { search: 'a', replacement: 'b' } } }
const result = { role: 'tool', name: 'replace_text', content: 'Replaced.' }
const reply = { role: 'assistant', content: 'Fatto.' }

test('canResumeMessages: riprendibile in tutti i casi di turno incompleto, e solo in quelli', async () => {
  const { canResumeMessages } = await load()
  assert.equal(canResumeMessages([]), false)
  assert.equal(canResumeMessages([user]), true, 'richiesta senza risposta')
  assert.equal(canResumeMessages([user, { role: 'assistant', content: 'x', error: true }]), true, 'errore')
  assert.equal(canResumeMessages([user, { role: 'assistant', content: 'parziale\n\n(interrupted)', interrupted: true }]), true, 'interrotto dall\'utente')
  assert.equal(canResumeMessages([user, call]), true, 'chiamata senza risultato')
  assert.equal(canResumeMessages([user, call, result]), true, 'risultato senza risposta')
  assert.equal(canResumeMessages([user, call, result, reply]), false, 'turno completo')
  assert.equal(canResumeMessages([user, reply]), false, 'risposta semplice')
})

test('prepareResume: riparte dall\'ultimo passo, scarta il parziale e non rifà il lavoro', async () => {
  const { prepareResume, INTERRUPTED_RESULT } = await load()
  // Stop mentre scriveva dopo un risultato: il testo parziale cade, si riparte dal risultato.
  const afterResult = prepareResume([user, call, result, { role: 'assistant', content: 'parz', interrupted: true }])
  assert.deepEqual(afterResult.messages, [user, call, result])
  assert.equal(afterResult.note, true)
  // Solo la richiesta: nessun lavoro fatto, nessuna nota.
  const plain = prepareResume([user])
  assert.deepEqual(plain.messages, [user])
  assert.equal(plain.note, false)
  // Errore subito dopo la richiesta: si riprova da capo, senza nota.
  const failedFirst = prepareResume([user, { role: 'assistant', content: 'boom', error: true }])
  assert.deepEqual(failedFirst.messages, [user])
  assert.equal(failedFirst.note, false)
})

test('prepareResume: una chiamata senza risultato riceve un esito ignoto, perché il modello controlli prima di ripetere', async () => {
  const { prepareResume, INTERRUPTED_RESULT } = await load()
  const prepared = prepareResume([user, call], () => '2026-01-01T00:00:00.000Z')
  assert.equal(prepared.messages.length, 3)
  assert.deepEqual(prepared.messages[2], { role: 'tool', name: 'replace_text', content: INTERRUPTED_RESULT, error: true, at: '2026-01-01T00:00:00.000Z' })
  assert.equal(prepared.note, true)
  // Non modifica l'originale.
  const original = [user, call]
  prepareResume(original)
  assert.equal(original.length, 2)
})

test('prepareResume: una chiamata interrotta insieme al parziale che la seguiva', async () => {
  const { prepareResume } = await load()
  const prepared = prepareResume([user, call, { role: 'assistant', content: 'x', interrupted: true }])
  assert.equal(prepared.messages.at(-1).role, 'tool')
  assert.equal(prepared.messages.at(-1).name, 'replace_text')
})
