const test = require('node:test')
const assert = require('node:assert/strict')

const load = () => import('../src/lib/svgIcon.js')

test('sizedSvg: un SVG con solo viewBox riceve una misura nel suo rapporto d\'aspetto', async () => {
  const { sizedSvg } = await load()
  assert.equal(sizedSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0"/></svg>'), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="256" height="256"><path d="M0 0"/></svg>')
  assert.match(sizedSvg('<svg viewBox="0 0 200 100"></svg>'), /width="256" height="128"/)
  assert.match(sizedSvg('<svg viewBox="0 0 100 400"></svg>'), /width="64" height="256"/)
})

test('sizedSvg: width e height esistenti (anche con px) si rimpiazzano e senza viewBox se ne crea uno', async () => {
  const { sizedSvg } = await load()
  const out = sizedSvg('<svg width="48px" height=\'24\' xmlns="http://www.w3.org/2000/svg"><rect/></svg>')
  assert.match(out, /width="256" height="128"/)
  assert.match(out, /viewBox="0 0 48 24"/)
  assert.equal((out.match(/width=/g) || []).length, 1, 'una sola width')
  // Con viewBox e misure in percentuale (non numeriche) vale il viewBox.
  assert.match(sizedSvg('<svg width="100%" height="100%" viewBox="0 0 10 20"></svg>'), /width="128" height="256"/)
})

test('sizedSvg: senza misure né viewBox quadrato; un testo che non è SVG resta com\'è', async () => {
  const { sizedSvg } = await load()
  assert.match(sizedSvg('<svg></svg>'), /^<svg width="256" height="256"><\/svg>$/)
  assert.equal(sizedSvg('non è un svg'), 'non è un svg')
})
