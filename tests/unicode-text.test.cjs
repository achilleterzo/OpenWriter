const test = require('node:test')
const assert = require('node:assert/strict')
const { STYLES, COVERAGE, stylize, unstyle, analyze, markdownToText, textToMarkdown } = require('../electron/unicode-text.cjs')

const ALL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const toText = (markdown, options) => markdownToText(markdown, options).text
const toMarkdown = (text, options) => textToMarkdown(text, options).markdown

// ---------- Le tabelle ----------

test('tabelle: ogni stile dà un carattere solo per lettera e cifra, e unstyle li riporta alla lettera normale', () => {
  const lossy = new Set(['squared', 'negativeSquared']) // senza minuscole: tornano maiuscole
  for (const style of STYLES) {
    const styled = stylize(ALL, style.id)
    assert.ok([...styled].length <= [...ALL].length, `${style.id}: nessun carattere in più`)
    const back = unstyle(styled)
    if (lossy.has(style.id)) assert.equal(back, ALL.toUpperCase().slice(0, 26) + ALL.slice(0, 26).toUpperCase() + ALL.slice(52), style.id)
    else if (style.id === 'smallCaps') assert.equal(back, ALL.replace('f', 'F'), 'piccole maiuscole: la f diventa F (la lettera vera non si disegna)')
    else assert.equal(back, ALL, style.id)
  }
})

test('piccole maiuscole: la s e la f non usano i caratteri che quasi nessun font ha, ma quelli veri si leggono ancora', () => {
  const { applyStyle } = require('../electron/unicode-text.cjs')
  const out = stylize('abcdefghijklmnopqrstuvwxyz', 'smallCaps')
  // Nessun carattere del blocco Latin Extended-D (U+A730-U+A731): i font non li hanno e li disegnano come un quadratino.
  for (const char of out) assert.ok(!(char.codePointAt(0) >= 0xA700 && char.codePointAt(0) <= 0xA7FF), `U+${char.codePointAt(0).toString(16)}`)
  assert.equal(stylize('s', 'smallCaps'), 's', 'la s a quell\'altezza è già la stessa forma')
  assert.equal(stylize('f', 'smallCaps'), 'F')
  assert.equal(stylize('sistema fuoco', 'smallCaps'), 'sɪsᴛᴇᴍᴀ Fᴜᴏᴄᴏ')
  // Chi le ha scritte altrove (ꜱ ꜰ) le vede ancora riconosciute come s e f.
  assert.equal(unstyle('ꜱꜰ'), 'sf')
  assert.equal(applyStyle('abc sf', 'smallCaps'), 'ᴀʙᴄ sF')
  // Applicato due volte si toglie ancora: le lettere che non cambiano non contano.
  assert.equal(applyStyle(applyStyle('Ciao mondo, così', 'smallCaps'), 'smallCaps'), 'Ciao mondo, così')
})

test('tabelle: i caratteri con stile sono quelli giusti (controllo indipendente con la normalizzazione di compatibilità di Unicode)', () => {
  // NFKC riporta alla lettera normale i blocchi "matematici", i cerchiati, i larghi e i quadrati: se una tabella avesse un codice sbagliato lo si vedrebbe.
  const skip = new Set(['smallCaps', 'negativeSquared']) // le piccole maiuscole e i quadrati neri non hanno una decomposizione di compatibilità
  for (const style of STYLES) {
    if (skip.has(style.id)) continue
    for (const char of ALL) {
      const styled = stylize(char, style.id)
      if (styled === char) continue
      const expected = style.lowerAsUpper ? char.toUpperCase() : char
      assert.equal(styled.normalize('NFKC'), expected, `${style.id} ${char} → U+${styled.codePointAt(0).toString(16)}`)
    }
  }
})

test('tabelle: le lettere che nel blocco matematico non esistono stanno altrove (ℎ ℬ ℭ ℝ…)', () => {
  assert.equal(stylize('h', 'italic'), 'ℎ')
  assert.equal(stylize('BEFHILMR', 'script'), 'ℬℰℱℋℐℒℳℛ')
  assert.equal(stylize('eg', 'script'), 'ℯℊ')
  assert.equal(stylize('CHIRZ', 'fraktur'), 'ℭℌℑℜℨ')
  assert.equal(stylize('CHNPQRZ', 'doubleStruck'), 'ℂℍℕℙℚℝℤ')
  for (const style of ['italic', 'script', 'fraktur', 'doubleStruck']) assert.equal(unstyle(stylize(ALL, style)), ALL, style)
})

test('tabelle: gli stili senza minuscole o senza cifre si comportano come promesso', () => {
  assert.equal(stylize('ab', 'squared'), stylize('AB', 'squared'))
  assert.equal(unstyle(stylize('ab', 'squared')), 'AB')
  assert.equal(stylize('ciao 2024', 'italic'), `${stylize('ciao', 'italic')} 2024`, 'in corsivo le cifre non esistono')
  assert.equal(stylize('ciao 2024', 'boldItalic'), `${stylize('ciao', 'boldItalic')} ${stylize('2024', 'bold')}`, 'in grassetto corsivo le cifre sono quelle del grassetto')
  assert.equal(stylize('x', 'smallCaps'), 'x', 'la x non ha una piccola maiuscola')
  assert.equal(unstyle(stylize('Ciao, mondo', 'smallCaps')), 'Ciao, mondo')
  assert.equal(stylize('0123456789', 'circled'), '⓪①②③④⑤⑥⑦⑧⑨')
})

test('tabelle: punteggiatura, simboli, emoji e altri alfabeti non cambiano', () => {
  const text = '¿Qué? — «ciao», #tag @nome 😀 日本語 Привет'
  const out = stylize(text, 'sansBold')
  for (const kept of ['¿', '?', '—', '«', '»', ',', '#', '@', '😀', '日本語', 'Привет']) assert.ok(out.includes(kept), kept)
  assert.equal(unstyle(out), text)
})

test('stile sconosciuto: errore chiaro', () => {
  assert.throws(() => stylize('x', 'inventato'), /Unknown style: inventato/)
})

// ---------- Accenti ----------

test('accenti: la lettera di base prende lo stile e l\'accento resta combinato; tornando indietro la lettera accentata è di nuovo intera', () => {
  const phrase = 'È già così: perché, più, però, città, Å Ñ Ü ç'
  for (const style of ['sansBold', 'italic', 'monospace', 'bold', 'doubleStruck', 'circled']) {
    const styled = stylize(phrase, style)
    assert.equal(unstyle(styled), phrase, style)
    assert.ok(!styled.includes('è') && !styled.includes('à'), `${style}: nessuna lettera accentata normale rimasta`)
  }
  assert.equal(stylize('è', 'sansBold'), '\u{1D5F2}̀')
})

test('accenti: con "keep" le lettere accentate restano normali', () => {
  assert.equal(stylize('è', 'sansBold', { accents: 'keep' }), 'è')
  assert.equal(stylize('città', 'sansBold', { accents: 'keep' }), `${stylize('citt', 'sansBold')}à`)
})

// ---------- Sottolineato e barrato ----------

test('decorazioni: sottolineato e barrato segnano le lettere, non gli spazi, e si tolgono con unstyle', () => {
  const text = 'ciao a tutti!'
  const underlined = stylize(text, ['sansBold', 'underline'])
  assert.equal([...underlined].filter((char) => char === '̲').length, 'ciaoatutti!'.length)
  assert.ok(!/\s̲/.test(underlined))
  assert.equal(unstyle(underlined), text)
  assert.equal(unstyle(stylize(text, 'strike')), text)
  assert.equal(stylize(text, 'strike').replace(/̶/g, ''), text)
})

test('analisi: elenca gli stili presenti', () => {
  const { styles } = analyze(`${stylize('uno', 'sansBold')} ${stylize('due', ['italic', 'underline'])} tre ${stylize('quattro', 'script')}`)
  assert.deepEqual(styles.sort(), ['italic', 'script', 'sansBold', 'underline'].sort())
  assert.deepEqual(analyze('niente di speciale').styles, [])
})

// ---------- Markdown → testo ----------

test('markdown → testo: grassetto, corsivo, entrambi, codice, barrato e sottolineato', () => {
  assert.equal(toText('**a** *b* ***c*** `d` ~~e~~ <u>f</u>'), `${stylize('a', 'sansBold')} ${stylize('b', 'sansItalic')} ${stylize('c', 'sansBoldItalic')} ${stylize('d', 'monospace')} ${stylize('e', 'strike')} ${stylize('f', 'underline')}`)
  assert.equal(toText('**a** *b*', { family: 'serif' }), `${stylize('a', 'bold')} ${stylize('b', 'italic')}`)
  assert.equal(toText('**a *b* c**'), `${stylize('a ', 'sansBold')}${stylize('b', 'sansBoldItalic')}${stylize(' c', 'sansBold')}`)
})

test('markdown → testo: titoli in grassetto, elenchi a più livelli, numerati, attività, citazioni e linea', () => {
  const md = '# Titolo\n\n- uno\n  - due\n    - tre\n      - quattro\n- [ ] da fare\n- [x] fatto\n\n3. terzo\n4. quarto\n\n> citazione\n> su due righe\n\n---\n'
  const out = toText(md).split('\n')
  assert.equal(out[0], stylize('Titolo', 'sansBold'))
  assert.deepEqual(out.slice(2, 8), ['• uno', '  ◦ due', '    ▪ tre', '      ▪ quattro', '☐ da fare', '☑ fatto'])
  assert.ok(out.includes('3. terzo') && out.includes('4. quarto'))
  assert.ok(out.includes('> citazione') && out.includes('> su due righe'))
  assert.equal(out.at(-1), '──────────')
})

test('markdown → testo: link, immagini, tabelle, HTML, codice con linguaggio: cosa si perde è dichiarato', () => {
  const link = markdownToText('[sito](https://x.it) e <https://y.it> e [https://z.it](https://z.it)')
  assert.equal(link.text, 'sito (https://x.it) e https://y.it e https://z.it')
  assert.equal(markdownToText('[sito](https://x.it)', { links: 'text' }).text, 'sito')
  assert.deepEqual(markdownToText('![logo](a.png)').lost, ['image'])
  const table = markdownToText('| a | b |\n|---|---|\n| 1 | 2 |')
  assert.equal(table.text, `${stylize('a', 'sansBold')} | ${stylize('b', 'sansBold')}\n1 | 2`)
  assert.deepEqual(table.lost, ['table'])
  assert.deepEqual(markdownToText('# T\n\n```js\nx\n```').lost.sort(), ['code-language', 'heading-level'])
  assert.ok(markdownToText('<div>x</div>').lost.includes('html'))
  assert.deepEqual(markdownToText('solo testo normale, nessuna perdita').lost, [])
})

test('markdown → testo: a capo forzati, entità, escape, formule e note', () => {
  assert.equal(toText('uno  \ndue'), 'uno\ndue')
  assert.equal(toText('Tom &amp; Jerry \\*non corsivo\\* a\\_b'), 'Tom & Jerry *non corsivo* a_b')
  const math = markdownToText('vale $x^2$ come [^1]\n\n[^1]: nota')
  assert.ok(math.text.includes('$x^2$') && math.text.includes('[^1]'))
  assert.ok(math.lost.includes('math') && math.lost.includes('footnote'))
  assert.equal(markdownToText('---\ntitle: x\n---\n\nTesto').text, 'Testo')
})

test('markdown → testo: il codice di blocco ha ogni riga in monospazio, vuote comprese', () => {
  const out = toText('```\nlet a\n\n  b()\n```')
  assert.equal(out, `${stylize('let a', 'monospace')}\n\n  ${stylize('b()', 'monospace')}`)
})

// ---------- Testo → Markdown ----------

test('testo → markdown: ogni stile con un segno Markdown torna a quel segno, in entrambe le famiglie', () => {
  for (const family of ['sans', 'serif']) {
    const text = toText('**a** *b* ***c*** `d` ~~e~~ <u>f</u>', { family })
    assert.equal(toMarkdown(text), '**a** *b* ***c*** `d` ~~e~~ <u>f</u>', family)
  }
  // Le due famiglie si leggono insieme.
  assert.equal(toMarkdown(`${stylize('a', 'sansBold')} ${stylize('b', 'bold')}`), '**a b**')
})

test('testo → markdown: un tratto con lo stesso stile prosegue attraverso spazi, cifre e punteggiatura, e i bordi restano fuori dai delimitatori', () => {
  assert.equal(toMarkdown(`${stylize('Versione', 'italic')} 2 ${stylize('beta', 'italic')}`), '*Versione 2 beta*')
  assert.equal(toMarkdown(stylize('ciao, mondo', 'sansBold')), '**ciao, mondo**')
  assert.equal(toMarkdown(`${stylize('ciao', 'sansBold')}, ${stylize('mondo', 'sansBold')}!`), '**ciao, mondo**!')
  assert.equal(toMarkdown(`prima ${stylize('uno', 'sansBold')} e ${stylize('due', 'sansBold')} dopo`), 'prima **uno** e **due** dopo', 'lettere normali in mezzo: due tratti')
  assert.equal(toMarkdown(`  ${stylize('x', 'sansBold')}  `), '  **x**  ', 'gli spazi ai bordi restano fuori dai delimitatori')
  assert.equal(toMarkdown(`${stylize('Anno 2024', 'boldItalic')} è ${stylize('2024', 'sansBold')}`), '***Anno 2024*** è **2024**')
})

test('testo → markdown: segni sovrapposti si annidano senza incrociarsi', () => {
  assert.equal(toMarkdown(stylize('tutto', ['sansBold', 'underline'])), '<u>**tutto**</u>')
  assert.equal(toMarkdown(`${stylize('uno ', 'sansBold')}${stylize('due', ['sansBold', 'underline'])}${stylize(' tre', 'sansBold')}`), '**uno <u>due</u> tre**')
  assert.equal(toMarkdown(stylize('barrato e sottolineato', ['sansItalic', 'strike', 'underline'])), '<u>~~*barrato e sottolineato*~~</u>')
})

test('testo → markdown: il codice usa tanti apici quanti servono; due righe in monospazio sono un blocco, una riga è codice in linea', () => {
  assert.equal(toMarkdown(stylize('a`b', 'monospace')), '``a`b``')
  // I segni di punteggiatura ai bordi non hanno varianti: stanno fuori dal tratto, come testo normale.
  assert.equal(toMarkdown(stylize('`x`', 'monospace')), '\\``x`\\`')
  const block = `${stylize('const a = 1', 'monospace')}\n${stylize('let b', 'monospace')}`
  assert.equal(toMarkdown(block), '```\nconst a = 1\nlet b\n```')
  // Le righe di sola punteggiatura (graffe, un fence) non hanno lettere in monospazio ma, dentro il codice, ne fanno parte.
  assert.equal(toMarkdown(`${stylize('a', 'monospace')}\n\`\`\`\n${stylize('b', 'monospace')}`), '~~~\na\n```\nb\n~~~')
  assert.equal(toMarkdown(`${stylize('function f() {', 'monospace')}\n  ${stylize('return 1', 'monospace')}\n}\n\nfine`), '```\nfunction f() {\n  return 1\n}\n```\n\nfine')
  assert.equal(toMarkdown(stylize('una riga', 'monospace')), '`una riga`')
  assert.equal(toMarkdown(`${stylize('a', 'monospace')}\n\n${stylize('b', 'monospace')}`), '```\na\n\nb\n```', 'una riga vuota dentro il codice resta nel blocco')
})

test('testo → markdown: elenchi, attività, numerati, citazioni e linee', () => {
  const text = '• uno\n  ◦ due\n    ▪ tre\n☐ da fare\n☑ fatto\n✅ anche questo\n1. primo\n2) secondo\n> citazione\n──────────\nfine'
  assert.equal(toMarkdown(text), '- uno\n  - due\n    - tre\n- [ ] da fare\n- [x] fatto\n- [x] anche questo\n1. primo\n2) secondo\n> citazione\n\n---\nfine')
  assert.equal(toMarkdown('testo\n---\nfine'), 'testo\n\n---\nfine', 'senza riga vuota prima, --- sarebbe la sottolineatura di un titolo')
})

test('testo → markdown: le righe di un paragrafo restano separate (a capo forzato) e un paragrafo nuovo resta nuovo', () => {
  assert.equal(toMarkdown('uno\ndue\n\ntre'), 'uno  \ndue\n\ntre')
  assert.equal(toMarkdown('uno\ndue', { hardBreaks: 'backslash' }), 'uno\\\ndue')
  assert.equal(toMarkdown('> a\n> b'), '> a  \n> b')
  assert.equal(toMarkdown('• a\n• b'), '- a\n- b', 'tra voci di elenco non serve')
})

test('testo → markdown: il testo normale si protegge perché il Markdown non lo prenda per formattazione', () => {
  assert.equal(toMarkdown('a_b * c `d` [e] <f> ~g~ \\h'), 'a\\_b \\* c \\`d\\` \\[e\\] \\<f> \\~g\\~ \\\\h')
  assert.equal(toMarkdown('Tom &amp; Jerry, &copy; 2024 & basta'), 'Tom \\&amp; Jerry, \\&copy; 2024 & basta')
  assert.equal(toMarkdown('# non un titolo\n- non un elenco\n+ nemmeno\n==='), '\\# non un titolo  \n\\- non un elenco  \n\\+ nemmeno  \n\\===')
  assert.equal(toMarkdown('#hashtag e 5 - 3'), '#hashtag e 5 - 3', 'un # attaccato e un - in mezzo non sono Markdown')
  // Con escape: false il testo che già usa le convenzioni del Markdown le conserva.
  assert.equal(toMarkdown('*enfasi* e_b', { escape: false }), '*enfasi* e_b')
  assert.equal(toMarkdown('# titolo', { escape: false }), '# titolo')
})

test('testo → markdown: un rientro di quattro spazi fuori da un elenco non diventa un blocco di codice', () => {
  const result = textToMarkdown('uno\n      rientrato')
  assert.equal(result.markdown, 'uno  \nrientrato')
  assert.deepEqual(result.lost, ['indentation'])
  assert.equal(toMarkdown('• voce\n    continua'), '- voce\n    continua  '.replace(/\s+$/, ''), 'dentro un elenco il rientro resta')
})

test('testo → markdown: gli stili senza segno Markdown restano (kept) o diventano normali (lost), e lo si dichiara', () => {
  const text = `${stylize('Titolo', 'script')} e ${stylize('nota', 'fraktur')} ${stylize('ok', 'sansBold')}`
  const kept = textToMarkdown(text)
  assert.equal(kept.markdown, `${stylize('Titolo', 'script')} e ${stylize('nota', 'fraktur')} **ok**`)
  assert.deepEqual(kept.kept.sort(), ['style:fraktur', 'style:script'])
  assert.deepEqual(kept.lost, [])
  const plain = textToMarkdown(text, { unmapped: 'plain' })
  assert.equal(plain.markdown, 'Titolo e nota **ok**')
  assert.deepEqual(plain.lost.sort(), ['style:fraktur', 'style:script'])
  assert.deepEqual(plain.kept, [])
})

// ---------- Nei due sensi ----------

// Un insieme di Markdown difficili: la conversione nei due sensi deve essere stabile (testo → markdown → testo dà lo stesso testo)
// e conservare i segni.
const CORPUS = [
  'Semplice testo, senza nulla.',
  '**Grassetto**, *corsivo* e ***entrambi***.',
  'Un **grassetto, con virgola e 2024** finale.',
  '**uno** **due** e **tre**',
  '*corsivo con 2 cifre e 3*',
  '`codice` accanto a **grassetto**`codice`',
  'Èèàùì: **perché**, *così*, ***già***, `città`.',
  '~~barrato~~ <u>sottolineato</u> **~~entrambi~~**',
  'a_b e snake_case e 2 * 3 e <tag> e [x] e ~tilde~',
  'Tom &amp; Jerry e \\*non enfasi\\*',
  '# Titolo\n\nParagrafo con **grassetto**.\n\n## Sottotitolo\n\nAltro.',
  '- uno\n  - due\n    - tre\n- quattro',
  '- [ ] da fare\n- [x] fatto\n\n1. primo\n2. secondo',
  '> citazione con **grassetto**\n> seconda riga',
  'riga uno  \nriga due  \nriga tre',
  'prima\n\n---\n\ndopo',
  '```\nlet a = 1\nlet b = 2\n```\n\nfine',
  '[link](https://x.it) e **[grassetto](https://y.it)**',
  'Emoji 😀 **forte** 🎉 *dolce* e 日本語 **日本語**',
  '**a**, **b**; **c**: **d**',
  '***a*** e **b *c* d**',
]

test('nei due sensi: markdown → testo → markdown → testo è stabile e i segni si conservano', () => {
  for (const markdown of CORPUS) {
    const first = markdownToText(markdown)
    const back = textToMarkdown(first.text)
    const second = markdownToText(back.markdown)
    assert.equal(second.text, first.text, `non stabile:\n${markdown}\n→ ${JSON.stringify(first.text)}\n→ ${JSON.stringify(back.markdown)}`)
    assert.deepEqual(back.lost, [], markdown)
  }
})

test('nei due sensi: i casi senza perdite tornano uguali al Markdown di partenza', () => {
  const identical = [
    '**Grassetto**, *corsivo* e ***entrambi***.',
    '*corsivo con 2 cifre e 3 dopo*',
    'Èèàùì: **perché**, *così*, ***già***, `città`.',
    '~~barrato~~ <u>sottolineato</u>',
    'a\\_b e snake\\_case e 2 \\* 3 e \\<tag> e \\[x\\] e \\~tilde\\~',
    '- uno\n  - due\n    - tre\n- quattro',
    '- [ ] da fare\n- [x] fatto\n\n1. primo\n2. secondo',
    '> citazione con **grassetto**\n> seconda riga'.replace('\n>', '  \n>'),
    'riga uno  \nriga due  \nriga tre',
    'prima\n\n---\n\ndopo',
    '```\nlet a = 1\nlet b = 2\n```\n\nfine',
    'Emoji 😀 **forte** 🎉 *dolce* e 日本語 senza stile',
  ]
  for (const markdown of identical) assert.equal(toMarkdown(toText(markdown)), markdown, markdown)
})

test('lettere senza variante: lo stile non ha effetto e la perdita è dichiarata, solo dove c\'è', () => {
  for (const markdown of ['**日本語**', '*Привет*', '**straße**', '`日本語`']) {
    const result = markdownToText(markdown)
    assert.ok(result.lost.includes('style-unavailable'), markdown)
    assert.equal(result.text.replace(/[̀-ͯ]/g, '').replace(/[^\p{L}]/gu, '').length > 0, true)
  }
  assert.equal(toText('**日本語**'), '日本語')
  assert.deepEqual(markdownToText('**ciao**, *così*, `città` e 日本語 senza stile').lost, [])
  assert.deepEqual(markdownToText('**日本語** e **ciao**').lost, ['style-unavailable'])
})

test('nei due sensi: due parole in grassetto separate da uno spazio tornano unite (stesso aspetto)', () => {
  assert.equal(toMarkdown(toText('**uno** **due** e **tre**')), '**uno due** e **tre**')
})

test('nei due sensi: la punteggiatura al bordo di un tratto con stile torna fuori, equivalente nel rendering', () => {
  assert.equal(toMarkdown(toText('**Ciao, mondo!**')), '**Ciao, mondo**!')
  assert.equal(toMarkdown(toText('(**nota**)')), '(**nota**)')
})

test('nei due sensi: titolo → riga in grassetto; il livello non torna', () => {
  assert.equal(toMarkdown(toText('## Titolo')), '**Titolo**')
})

test('tabella COVERAGE: coerente con ciò che fanno le funzioni', () => {
  const ids = new Set()
  for (const row of COVERAGE) {
    assert.ok(!ids.has(row.id), `id doppio ${row.id}`)
    ids.add(row.id)
    assert.ok([true, false, 'approx'].includes(row.back), row.id)
    assert.ok(row.markdown && row.text, row.id)
    if (row.back !== true) assert.ok(row.loss, `${row.id}: manca cosa si perde`)
  }
  // Cosa dichiara "torna uguale" lo fa davvero, cosa dichiara "non torna" non torna.
  const check = { strong: '**x**', em: '*x*', 'strong-em': '***x***', code: '`x`', strike: '~~x~~', underline: '<u>x</u>', accents: 'è à ü ñ', list: '- x', 'ordered-list': '1. x', task: '- [ ] x', quote: '> x', rule: 'a\n\n---\n\nb' }
  for (const [id, markdown] of Object.entries(check)) {
    assert.equal(COVERAGE.find((row) => row.id === id).back, true, id)
    assert.equal(toMarkdown(toText(markdown)), markdown, id)
  }
  for (const id of ['link', 'image', 'table']) {
    const sample = { link: '[x](https://u.it)', image: '![x](u.png)', table: '| a | b |\n|---|---|\n| 1 | 2 |' }[id]
    assert.equal(COVERAGE.find((row) => row.id === id).back, false, id)
    assert.notEqual(toMarkdown(toText(sample)), sample, id)
  }
})

// ---------- Casi limite ----------

test('casi limite: vuoto, solo spazi, null, a capo di Windows, testo lungo', () => {
  for (const empty of ['', null, undefined]) {
    assert.equal(toText(empty), '')
    assert.equal(stylize(empty, 'sansBold'), '')
    assert.equal(unstyle(empty), '')
    assert.equal(toMarkdown(empty), '')
  }
  assert.equal(toText('   '), '')
  assert.equal(stylize('   ', 'sansBold'), '   ')
  assert.equal(toMarkdown('   ').trim(), '')
  assert.equal(toMarkdown(`${stylize('a', 'sansBold')}\r\n${stylize('b', 'sansBold')}`), '**a**  \n**b**')
  const long = `${stylize('parola ', 'sansBold')}normale `.repeat(20000)
  const started = Date.now()
  assert.ok(toMarkdown(long).startsWith('**parola** normale'))
  assert.ok(Date.now() - started < 5000, 'un testo lungo si converte in tempi ragionevoli')
})

test('casi limite: segni combinati isolati o in testa non rompono nulla', () => {
  assert.doesNotThrow(() => toMarkdown('̲ solo segno e ́ accento isolato'))
  assert.equal(unstyle('̲x'), 'x')
})

// ---------- Il menu del lettore testuale ----------

test('menu degli stili: ogni voce funziona, ha un\'etichetta, e ogni stile è offerto una volta sola', () => {
  const { styleMenu, STYLE_GROUPS } = require('../electron/unicode-text.cjs')
  const menu = styleMenu()
  const ids = menu.map((item) => item.id)
  assert.equal(new Set(ids).size, ids.length, 'nessuna voce doppia')
  assert.deepEqual(menu.filter((item) => item.group === 'common').map((item) => item.id), STYLE_GROUPS.common)
  assert.deepEqual(menu.filter((item) => item.group === 'other').map((item) => item.id), STYLE_GROUPS.other)
  for (const item of menu) {
    assert.ok(item.label, item.id)
    assert.ok(Array.isArray(item.marks), item.id)
    assert.notEqual(stylize('Aa', item.id), 'Aa', `${item.id}: lo stile cambia il testo`)
    assert.equal(unstyle(stylize('Aa', item.id)), item.id === 'squared' || item.id === 'negativeSquared' ? 'AA' : 'Aa', item.id)
  }
  // Ogni alfabeto è nel menu (le decorazioni sono in più).
  for (const style of STYLES) assert.ok(ids.includes(style.id), `${style.id} manca dal menu`)
  assert.deepEqual(menu.find((item) => item.id === 'sansBold').marks, ['strong'])
  assert.deepEqual(menu.find((item) => item.id === 'underline').marks, ['underline'])
})

// ---------- Applicare uno stile a un testo che ne ha già uno ----------

test('applyStyle: uno stile sostituisce quello che c\'è, e lo stesso stile due volte lo toglie', () => {
  const { applyStyle } = require('../electron/unicode-text.cjs')
  const text = 'Ciao è già 2024, così!'
  const bold = applyStyle(text, 'sansBold')
  assert.equal(bold, stylize(text, 'sansBold'))
  // Un secondo stile sostituisce il primo (prima non faceva nulla: le lettere con stile non sono nella tabella).
  assert.equal(applyStyle(bold, 'sansItalic'), stylize(text, 'sansItalic'))
  assert.equal(applyStyle(applyStyle(bold, 'sansItalic'), 'monospace'), stylize(text, 'monospace'))
  // Lo stesso stile due volte lo toglie.
  assert.equal(applyStyle(bold, 'sansBold'), text)
  for (const style of ['bold', 'italic', 'boldItalic', 'sansBoldItalic', 'monospace', 'script', 'doubleStruck', 'circled', 'fullwidth', 'smallCaps']) {
    assert.equal(applyStyle(applyStyle(text, style), style), text, `${style}: due volte torna al testo`)
  }
})

test('applyStyle: un testo in parte con lo stile diventa tutto con lo stile; le cifre che il nuovo stile non ha tornano normali', () => {
  const { applyStyle } = require('../electron/unicode-text.cjs')
  assert.equal(applyStyle(`ciao ${stylize('mondo', 'sansBold')}`, 'sansBold'), stylize('ciao mondo', 'sansBold'))
  assert.equal(applyStyle(stylize('Anno 2024', 'sansBold'), 'sansItalic'), `${stylize('Anno', 'sansItalic')} 2024`, 'le cifre in corsivo non esistono')
  assert.equal(applyStyle(stylize('Anno 2024', 'bold'), 'boldItalic'), stylize('Anno 2024', 'boldItalic'))
  assert.equal(applyStyle(stylize('Anno 2024', 'boldItalic'), 'boldItalic'), 'Anno 2024', 'il grassetto corsivo con le sue cifre si toglie del tutto')
  assert.equal(applyStyle(stylize('ABC abc', 'bold'), 'smallCaps'), `ABC ${stylize('abc', 'smallCaps')}`, 'le maiuscole non hanno una piccola maiuscola: tornano normali')
})

test('applyStyle: sottolineato e barrato si sommano allo stile e si tolgono da soli', () => {
  const { applyStyle } = require('../electron/unicode-text.cjs')
  const bold = stylize('ciao mondo', 'sansBold')
  const underlined = applyStyle(bold, 'underline')
  assert.equal(underlined, stylize('ciao mondo', ['sansBold', 'underline']))
  assert.equal(applyStyle(underlined, 'underline'), bold)
  // Il segno non si duplica, e cambiare lo stile lo conserva.
  assert.equal(applyStyle(underlined, 'sansItalic'), stylize('ciao mondo', ['sansItalic', 'underline']))
  assert.equal([...applyStyle('ciao', 'strike')].filter((char) => char === '̶').length, 4)
  // Barrato e sottolineato insieme: entrambi i segni su ogni lettera, e il testo non cambia.
  const both = applyStyle(applyStyle('ciao a tutti', 'strike'), 'underline')
  assert.equal(unstyle(both), 'ciao a tutti')
  assert.equal([...both].filter((char) => char === '̶').length, 'ciaoatutti'.length)
  assert.equal([...both].filter((char) => char === '̲').length, 'ciaoatutti'.length)
  // Su un testo con solo una parte sottolineata il sottolineato si estende a tutto.
  assert.equal(unstyle(applyStyle(`${stylize('uno', 'underline')} due`, 'underline')), 'uno due')
  assert.equal([...applyStyle(`${stylize('uno', 'underline')} due`, 'underline')].filter((char) => char === '̲').length, 'unodue'.length)
})

test('applyStyle: accenti, testo vuoto e stile sconosciuto', () => {
  const { applyStyle } = require('../electron/unicode-text.cjs')
  assert.equal(unstyle(applyStyle('è à ü ñ', 'sansBold')), 'è à ü ñ')
  assert.equal(applyStyle('è', 'sansBold', { accents: 'keep' }), 'è')
  for (const empty of ['', '   ', null, undefined]) assert.equal(applyStyle(empty, 'sansBold'), empty ? empty : '')
  assert.equal(applyStyle('😀 ciao', 'sansBold'), `😀 ${stylize('ciao', 'sansBold')}`)
  assert.throws(() => applyStyle('x', 'inventato'), /Unknown style: inventato/)
})

// ---------- Accenti lasciati normali (la scelta di base dell'app) ----------

test('accenti normali: il grassetto e il corsivo attraversano le lettere accentate rimaste normali, nei due sensi', () => {
  const samples = [
    'Èèàùì: **perché**, *così*, ***già***, `città`.',
    'Una **cosa più bella** e *così lunga* e **là**',
    '~~barràto~~ e <u>sottolineàto</u>',
  ]
  for (const markdown of samples) {
    const { text } = markdownToText(markdown, { accents: 'keep' })
    // Nessun accento combinato nel testo (restano solo i segni di sottolineato e barrato): le lettere accentate sono quelle normali.
    assert.ok(!/[̀-̱̳-̵̷-ͯ]/.test(text), markdown)
    assert.equal(toMarkdown(text), markdown, markdown)
  }
})

test('accenti normali: una parola di sole lettere accentate non può portare lo stile, e lo perde', () => {
  assert.equal(toMarkdown(markdownToText('**àèìòù**', { accents: 'keep' }).text), 'àèìòù')
  assert.equal(toMarkdown(markdownToText('**àèìòù**', { accents: 'combine' }).text), '**àèìòù**')
})

test('accenti normali: una lettera accentata separata dalle parole con stile da spazi resta una parola normale', () => {
  const text = `${stylize('ciao', 'sansBold')} è ${stylize('bello', 'sansBold')}`
  assert.equal(toMarkdown(text), '**ciao** è **bello**')
  // Attaccata a una lettera con stile, invece, ne fa parte.
  assert.equal(toMarkdown(`${stylize('perch', 'sansBold')}é`), '**perché**')
  assert.equal(toMarkdown(`à${stylize('nche', 'sansItalic')}`), '*ànche*')
  // Una lettera accentata sola non prende nessuno stile.
  assert.equal(toMarkdown('è'), 'è')
})

test('accenti normali: con "keep" il testo con stile non contiene accenti combinati, con "combine" sì', () => {
  const keep = markdownToText('**perché è già così**', { accents: 'keep' }).text
  const combine = markdownToText('**perché è già così**', { accents: 'combine' }).text
  assert.ok(keep.includes('é') && keep.includes('è') && keep.includes('à') && keep.includes('ì'))
  assert.ok(!keep.includes('́') && !keep.includes('̀'))
  assert.ok(combine.includes('́') && combine.includes('̀'))
  // Con gli accenti combinati torna lo stesso Markdown; con quelli normali una parola di sola lettera accentata ("è") non può mostrare il grassetto e ne resta fuori.
  assert.equal(toMarkdown(combine), '**perché è già così**')
  assert.equal(toMarkdown(keep), '**perché** è **già così**')
})
