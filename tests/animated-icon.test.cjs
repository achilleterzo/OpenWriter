const test = require('node:test')
const assert = require('node:assert/strict')

const load = () => import('../src/lib/animatedIcon.js')

test('frameAt: sceglie il fotogramma dal tempo, in ciclo', async () => {
  const { frameAt } = await load()
  const animation = { frames: [{ bitmap: 'a', duration: 100 }, { bitmap: 'b', duration: 50 }, { bitmap: 'c', duration: 150 }], total: 300 }
  assert.equal(frameAt(animation, 0), 'a')
  assert.equal(frameAt(animation, 99), 'a')
  assert.equal(frameAt(animation, 100), 'b')
  assert.equal(frameAt(animation, 149), 'b')
  assert.equal(frameAt(animation, 150), 'c')
  assert.equal(frameAt(animation, 299), 'c')
  assert.equal(frameAt(animation, 300), 'a', 'ricomincia')
  assert.equal(frameAt(animation, 1400), 'c')
})

test('decodeAnimatedIcon: senza ImageDecoder o senza un data URL non c è animazione e non solleva errori', async () => {
  const { decodeAnimatedIcon } = await load()
  assert.equal(await decodeAnimatedIcon('data:image/gif;base64,AAAA'), null)
  assert.equal(await decodeAnimatedIcon('non un url'), null)
})
