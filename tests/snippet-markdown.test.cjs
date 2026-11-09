const test = require('node:test')
const assert = require('node:assert/strict')

const load = () => import('../src/lib/snippetMarkdown.js')
const plain = (tokens) => tokens.map((token) => token.text).join('')
const styled = (tokens, key) => tokens.filter((token) => token[key]).map((token) => token.text)

test('snippetMarkdown: grassetto, corsivo, barrato e codice in linea diventano stile, senza simboli', async () => {
  const { snippetTokens } = await load()
  const tokens = snippetTokens('un **grassetto**, un *corsivo*, un _altro_, ~~barrato~~ e `codice()` finali')
  assert.equal(plain(tokens), 'un grassetto, un corsivo, un altro, barrato e codice() finali')
  assert.deepEqual(styled(tokens, 'bold'), ['grassetto'])
  assert.deepEqual(styled(tokens, 'italic'), ['corsivo', 'altro'])
  assert.deepEqual(styled(tokens, 'strike'), ['barrato'])
  assert.deepEqual(styled(tokens, 'code'), ['codice()'])
})

test('snippetMarkdown: link e immagini lasciano il testo; note, HTML e escape spariscono', async () => {
  const { snippetTokens } = await load()
  assert.equal(plain(snippetTokens('vedi [la guida](https://x.it/a_b "titolo") e ![logo](img/a.png) più [rif][1]')), 'vedi la guida e logo più rif')
  assert.equal(plain(snippetTokens('nota[^3] con <b>html</b> e \\*asterisco\\* e <https://x.it>')), 'nota con html e *asterisco* e https://x.it')
})

test('snippetMarkdown: simboli di blocco (titoli, citazioni, elenchi, linee, recinti) tolti, tabelle a celle', async () => {
  const { snippetTokens } = await load()
  const text = '## Titolo\n> citazione\n- uno\n2. due\n- [x] fatto\n---\n```js\nlet a = 1\n```\n| nome | valore |\n|---|---|\n| a | 1 |'
  assert.equal(plain(snippetTokens(text)), 'Titolo citazione • uno 2. due ☑ fatto let a = 1 nome · valore a · 1')
  assert.deepEqual(styled(snippetTokens('# Solo titolo\ntesto'), 'bold'), ['Solo titolo'], 'il titolo è in grassetto')
})

test('snippetMarkdown: un simbolo rimasto aperto dal taglio si toglie, un asterisco isolato resta', async () => {
  const { snippetTokens } = await load()
  assert.equal(plain(snippetTokens('…fine di **un grassetto tagliato')), '…fine di un grassetto tagliato')
  assert.equal(plain(snippetTokens('3 * 4 = 12 e snake_case_name')), '3 * 4 = 12 e snake_case_name')
  // L'estratto del significato è su una riga sola: un # di titolo rimasto in mezzo si toglie.
  assert.equal(plain(snippetTokens('prima ## Un titolo poi testo')), 'prima Un titolo poi testo')
})

test('snippetMarkdown: le parole trovate « » restano evidenziate, anche dentro gli stili', async () => {
  const { snippetTokens } = await load()
  const tokens = snippetTokens('il «faro» è **«grande» e bello** e `«x»`')
  assert.equal(plain(tokens), 'il faro è grande e bello e x')
  assert.deepEqual(styled(tokens, 'mark'), ['faro', 'grande', 'x'])
  const bold = tokens.find((token) => token.text === 'grande')
  assert.ok(bold.bold && bold.mark)
  // Una evidenziazione che avvolge uno stile.
  const wrapped = snippetTokens('«uno **due** tre»')
  assert.deepEqual(styled(wrapped, 'mark'), ['uno ', 'due', ' tre'])
  assert.equal(plain(wrapped), 'uno due tre')
  assert.ok(wrapped.every((token) => token.mark))
})

test('snippetMarkdown: testo vuoto o senza formattazione', async () => {
  const { snippetTokens } = await load()
  assert.deepEqual(snippetTokens(''), [])
  assert.deepEqual(snippetTokens(null), [])
  assert.deepEqual(snippetTokens('solo testo normale'), [{ text: 'solo testo normale' }])
})
