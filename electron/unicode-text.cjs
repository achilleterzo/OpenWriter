const { lex, normalizeNewlines } = require('./markdown-tokens.cjs')

/**
 * Testo "formattato" con caratteri Unicode che imitano il grassetto, il corsivo, il monospazio… (come fanno i formattatori online per i social), e la
 * conversione nei due sensi con il Markdown:
 *   markdown → testo   `markdownToText`   **grassetto** → 𝗴𝗿𝗮𝘀𝘀𝗲𝘁𝘁𝗼, *corsivo* → 𝘤𝘰𝘳𝘴𝘪𝘷𝘰, `codice` → 𝚌𝚘𝚍𝚒𝚌𝚎, elenchi → •, link → testo (indirizzo)…
 *   testo → markdown   `textToMarkdown`   il contrario, e il testo normale si protegge perché il Markdown non lo prenda per formattazione.
 * Sono funzioni pure, senza Electron. Ogni conversione restituisce anche cosa si è perso (`lost`) e cosa è rimasto com'era perché non ha un
 * equivalente (`kept`): la tabella COVERAGE dice in anticipo cosa passa, cosa passa a metà e cosa no.
 *
 * Limiti di fondo, da dire all'utente: sono lettere "matematiche", non formattazione vera; i lettori di schermo le leggono male e la ricerca nel testo
 * non le trova; la punteggiatura non ha varianti (resta normale); le lettere accentate si ottengono con l'accento combinato, che alcuni font disegnano male;
 * quali piattaforme le accettano e con quali font va provato.
 */

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const DIGITS = '0123456789'
const code = (value) => String.fromCodePoint(value)
const UNDERLINE = '\u0332'
const STRIKE = '\u0336'
const DECORATIONS = { underline: UNDERLINE, strike: STRIKE }
const isMark = (char) => /\p{M}/u.test(char)

// ---------- Le tabelle ----------

// Piccole maiuscole. La x non ha una lettera sua e resta com'è. La s (U+A731) e la f (U+A730) esistono, ma stanno in un blocco che quasi nessun font ha
// (su un computer con un centinaio di font ne avevano tre: gli altri le disegnano come un quadratino, anche nel campo dove le si scrive e nei posti dove si incolla): la s
// resta normale (a quella altezza è la stessa forma) e la f diventa F (vedi `fallback` dello stile). Le due lettere vere si riconoscono comunque in lettura (`readAlso`).
const SMALL_CAPS = [0x1D00, 0x0299, 0x1D04, 0x1D05, 0x1D07, null, 0x0262, 0x029C, 0x026A, 0x1D0A, 0x1D0B, 0x029F, 0x1D0D, 0x0274, 0x1D0F, 0x1D18, 0x01EB, 0x0280, null, 0x1D1B, 0x1D1C, 0x1D20, 0x1D21, null, 0x028F, 0x1D22]

/**
 * Gli alfabeti. Per ognuno: `upper`, `lower` e `digits` sono i primi codici dei blocchi Unicode (le lettere di un blocco sono consecutive);
 * `holes` sono le lettere che nel blocco non ci sono e stanno altrove (ℎ, ℬ, ℭ, ℝ…); `digitsLike` = le cifre di un altro stile (quelle in corsivo non esistono);
 * `lowerAsUpper` = non esistono le minuscole: si usano le maiuscole. `fallback` = la lettera che si usa dove lo stile non ha un carattere che i font disegnano.
 * `readAlso` = caratteri che in lettura valgono come una lettera dello stile ma che non si scrivono. `mark` = il segno Markdown che questo stile rappresenta.
 */
const STYLES = [
  { id: 'bold', label: 'Bold (serif)', upper: 0x1D400, lower: 0x1D41A, digits: 0x1D7CE, mark: ['strong'] },
  { id: 'italic', label: 'Italic (serif)', upper: 0x1D434, lower: 0x1D44E, holes: { h: '\u210E' }, mark: ['em'] },
  { id: 'boldItalic', label: 'Bold italic (serif)', upper: 0x1D468, lower: 0x1D482, digitsLike: 'bold', mark: ['strong', 'em'] },
  { id: 'sans', label: 'Sans-serif', upper: 0x1D5A0, lower: 0x1D5BA, digits: 0x1D7E2 },
  { id: 'sansBold', label: 'Bold (sans-serif)', upper: 0x1D5D4, lower: 0x1D5EE, digits: 0x1D7EC, mark: ['strong'] },
  { id: 'sansItalic', label: 'Italic (sans-serif)', upper: 0x1D608, lower: 0x1D622, mark: ['em'] },
  { id: 'sansBoldItalic', label: 'Bold italic (sans-serif)', upper: 0x1D63C, lower: 0x1D656, digitsLike: 'sansBold', mark: ['strong', 'em'] },
  { id: 'monospace', label: 'Monospace', upper: 0x1D670, lower: 0x1D68A, digits: 0x1D7F6, mark: ['code'] },
  { id: 'script', label: 'Script', upper: 0x1D49C, lower: 0x1D4B6, holes: { B: '\u212C', E: '\u2130', F: '\u2131', H: '\u210B', I: '\u2110', L: '\u2112', M: '\u2133', R: '\u211B', e: '\u212F', g: '\u210A', o: '\u2134' } },
  { id: 'boldScript', label: 'Bold script', upper: 0x1D4D0, lower: 0x1D4EA },
  { id: 'fraktur', label: 'Fraktur', upper: 0x1D504, lower: 0x1D51E, holes: { C: '\u212D', H: '\u210C', I: '\u2111', R: '\u211C', Z: '\u2128' } },
  { id: 'boldFraktur', label: 'Bold fraktur', upper: 0x1D56C, lower: 0x1D586 },
  { id: 'doubleStruck', label: 'Double-struck', upper: 0x1D538, lower: 0x1D552, digits: 0x1D7D8, holes: { C: '\u2102', H: '\u210D', N: '\u2115', P: '\u2119', Q: '\u211A', R: '\u211D', Z: '\u2124' } },
  { id: 'circled', label: 'Circled', upper: 0x24B6, lower: 0x24D0, digitList: '⓪①②③④⑤⑥⑦⑧⑨' },
  { id: 'fullwidth', label: 'Fullwidth', upper: 0xFF21, lower: 0xFF41, digits: 0xFF10 },
  { id: 'squared', label: 'Squared (capitals)', upper: 0x1F130, lowerAsUpper: true },
  { id: 'negativeSquared', label: 'Negative squared (capitals)', upper: 0x1F170, lowerAsUpper: true },
  { id: 'smallCaps', label: 'Small capitals', lowerList: SMALL_CAPS, fallback: { f: 'F' }, readAlso: { 'ꜰ': 'f', 'ꜱ': 's' } },
]

function buildForward(style) {
  const map = new Map()
  const holes = style.holes || {}
  for (let index = 0; index < 26; index += 1) {
    const upper = UPPER[index]
    const lower = LOWER[index]
    if (style.upper != null) map.set(upper, holes[upper] || code(style.upper + index))
    if (style.lowerAsUpper) map.set(lower, map.get(upper))
    else if (style.lower != null) map.set(lower, holes[lower] || code(style.lower + index))
    else if (style.lowerList && style.lowerList[index] != null) map.set(lower, code(style.lowerList[index]))
  }
  if (style.digits != null) for (let index = 0; index < 10; index += 1) map.set(DIGITS[index], code(style.digits + index))
  if (style.digitList) [...style.digitList].forEach((char, index) => map.set(DIGITS[index], char))
  return map
}

const FORWARD = new Map(STYLES.map((style) => [style.id, buildForward(style)]))
const FALLBACK = new Map(STYLES.map((style) => [style.id, style.fallback || {}]))
// Le cifre che uno stile prende in prestito da un altro (grassetto corsivo → quelle del grassetto).
for (const style of STYLES) {
  if (!style.digitsLike) continue
  const donor = FORWARD.get(style.digitsLike)
  for (const digit of DIGITS) FORWARD.get(style.id).set(digit, donor.get(digit))
}

// Dal carattere con lo stile alla lettera normale. Ogni carattere appartiene a uno stile solo (lo si controlla qui: un doppione sarebbe un errore nelle tabelle).
const REVERSE = new Map()
for (const style of STYLES) {
  for (const [plain, styled] of FORWARD.get(style.id)) {
    if (style.lowerAsUpper && LOWER.includes(plain)) continue // le maiuscole con lo stile rappresentano maiuscole
    if (style.digitsLike && DIGITS.includes(plain)) continue // le cifre sono quelle dello stile prestato
    if (styled === plain) continue
    if (REVERSE.has(styled)) throw new Error(`Duplicate styled character U+${styled.codePointAt(0).toString(16)} in ${style.id}`)
    REVERSE.set(styled, { style: style.id, plain, digit: DIGITS.includes(plain) })
  }
}

for (const style of STYLES) {
  for (const [styled, plain] of Object.entries(style.readAlso || {})) {
    if (REVERSE.has(styled)) throw new Error(`Duplicate styled character U+${styled.codePointAt(0).toString(16)} in ${style.id}`)
    REVERSE.set(styled, { style: style.id, plain, digit: false })
  }
}

const STYLE_MARK = Object.fromEntries(STYLES.filter((style) => style.mark).map((style) => [style.id, style.mark]))
// Chi scrive in grassetto corsivo ha cifre in grassetto: nel leggere, quelle cifre seguono lo stile delle lettere vicine.
const SHARED_DIGITS = { bold: 'boldItalic', sansBold: 'sansBoldItalic' }
// Due stili con gli stessi segni Markdown (grassetto con e senza grazie) sono lo stesso tratto; quelli senza segni solo se sono lo stesso stile.
const sameRun = (left, right) => left === right || (Boolean(STYLE_MARK[left]) && Boolean(STYLE_MARK[right]) && STYLE_MARK[left].join() === STYLE_MARK[right].join())

// Gli stili per le due famiglie (con o senza grazie) e per ciascun segno Markdown.
const FAMILY = {
  sans: { strong: 'sansBold', em: 'sansItalic', both: 'sansBoldItalic' },
  serif: { strong: 'bold', em: 'italic', both: 'boldItalic' },
}

// ---------- Testo → testo con lo stile ----------

/**
 * Il testo con lo stile dato: un identificatore di STYLES, 'underline' o 'strike' (sottolineato e barrato si ottengono con un segno combinato dopo
 * ogni lettera), oppure un elenco (uno stile e le decorazioni). Spazi, punteggiatura e simboli non hanno varianti e restano come sono.
 * `accents`: 'combine' (predefinito) stila la lettera di base e le lascia l'accento combinato (è → 𝗲 + accento); 'keep' lascia com'erano le lettere accentate.
 */
function stylize(text, style, { accents = 'combine' } = {}) {
  const ids = [].concat(style ?? [])
  const unknown = ids.filter((id) => !FORWARD.has(id) && !DECORATIONS[id])
  if (unknown.length) throw new Error(`Unknown style: ${unknown.join(', ')}`)
  const alphabetId = ids.find((id) => FORWARD.has(id))
  const alphabet = alphabetId ? FORWARD.get(alphabetId) : null
  const fallback = alphabetId ? FALLBACK.get(alphabetId) : {}
  const marks = ids.filter((id) => DECORATIONS[id]).map((id) => DECORATIONS[id]).join('')
  const input = accents === 'keep' ? String(text ?? '') : String(text ?? '').normalize('NFD')
  let out = ''
  for (const char of input) {
    if (isMark(char)) { out += char; continue }
    out += alphabet?.get(char) ?? fallback[char] ?? char
    if (marks && !/[\s\p{Cc}]/u.test(char)) out += marks
  }
  return out.normalize('NFC')
}

/**
 * Applica uno stile a un testo che può averne già, come il pulsante del grassetto di un editor:
 *  · uno stile di alfabeto sostituisce quello che c'è (il grassetto su un testo in corsivo lo rende grassetto) e, se tutto il testo ha già quello stile, lo toglie;
 *  · una decorazione (sottolineato, barrato) si aggiunge senza toccare lo stile e, se c'è già su tutto il testo, si toglie.
 * Accenti e decorazioni già presenti restano. Ciò che il nuovo stile non ha (le cifre in corsivo, le maiuscole delle piccole maiuscole) torna normale.
 * `style` è un identificatore di STYLES, 'underline' o 'strike'; `accents` come in stylize.
 */
function applyStyle(text, style, { accents = 'combine' } = {}) {
  const id = [].concat(style ?? [])[0]
  const alphabet = FORWARD.get(id)
  const flag = id === 'underline' ? 'underline' : id === 'strike' ? 'strike' : null
  if (!alphabet && !flag) throw new Error(`Unknown style: ${id}`)
  const input = accents === 'keep' ? String(text ?? '') : String(text ?? '').normalize('NFD')
  const units = toUnits(input)
  if (flag) {
    const hosts = units.filter((unit) => !isMark(unit.char) && !/[\s\p{Cc}]/u.test(unit.char))
    const remove = hosts.length > 0 && hosts.every((unit) => unit[flag])
    for (const unit of hosts) unit[flag] = !remove
  }
  let target = id
  if (alphabet) {
    // Già tutto in quello stile (le cifre di un grassetto corsivo sono quelle del grassetto): si toglie.
    const covered = units.filter((unit) => alphabet.has(unit.plain))
    const inStyle = (unit) => unit.style === id || (unit.digit && SHARED_DIGITS[unit.style] === id)
    if (covered.length && covered.every(inStyle)) target = null
  }
  let out = ''
  for (const unit of units) {
    let char = unit.char
    if (alphabet) {
      if (alphabet.has(unit.plain)) char = target ? alphabet.get(unit.plain) : unit.plain
      else if (target) char = FALLBACK.get(id)[unit.plain] ?? (unit.style ? unit.plain : char)
    }
    out += char + unit.accents + (unit.underline ? UNDERLINE : '') + (unit.strike ? STRIKE : '')
  }
  return out.normalize('NFC')
}

/** Il testo senza alcuno stile: ogni lettera o cifra con stile torna normale e le decorazioni (sottolineato, barrato) si tolgono. */
function unstyle(text) {
  let out = ''
  for (const char of String(text ?? '')) {
    const hit = REVERSE.get(char)
    if (hit) out += hit.plain
    else if (char !== UNDERLINE && char !== STRIKE) out += char
  }
  return out.normalize('NFC')
}

// ---------- Leggere il testo con lo stile ----------

// Il testo come unità: un carattere con i segni combinati che lo seguono (sottolineato, barrato, accenti).
function toUnits(text) {
  const units = []
  for (const char of String(text ?? '')) {
    if (units.length && isMark(char)) {
      const last = units[units.length - 1]
      if (char === UNDERLINE) last.underline = true
      else if (char === STRIKE) last.strike = true
      else last.accents += char
      continue
    }
    const hit = REVERSE.get(char)
    units.push({ char, plain: hit ? hit.plain : char, style: hit ? hit.style : null, digit: Boolean(hit?.digit), accents: '', underline: false, strike: false })
  }
  return units
}

// Un intervallo con lo stesso stile prosegue attraverso ciò che sta in mezzo se non ha lettere né a capo (spazi, cifre, punteggiatura: non hanno varianti).
const gapJoins = (units, styles, from, to) => {
  for (let index = from; index < to; index += 1) {
    if (styles[index] || units[index].plain === '\n' || /\p{L}/u.test(units[index].plain)) return false
  }
  return true
}

// Lo stile di ogni unità. Una lettera accentata rimasta normale (con gli accenti lasciati normali, che è la scelta di base: l'accento combinato su una lettera con stile
// lo disegnano male molti programmi) dentro una parola con stile ne fa parte: ha lo stile della lettera accanto, anche attraverso più lettere accentate di fila.
function inheritedStyles(units) {
  const styles = units.map((unit) => unit.style)
  const accented = (unit) => !unit.style && /^[A-Za-z]\p{M}+$/u.test(unit.plain.normalize('NFD'))
  const adoptable = (style) => Boolean(style) && Boolean(STYLE_MARK[style])
  for (let index = 1; index < units.length; index += 1) if (accented(units[index]) && adoptable(styles[index - 1])) styles[index] = styles[index - 1]
  for (let index = units.length - 2; index >= 0; index -= 1) if (accented(units[index]) && !styles[index] && adoptable(styles[index + 1])) styles[index] = styles[index + 1]
  return styles
}

function styleRuns(units, styles) {
  const runs = []
  let current = null
  units.forEach((unit, index) => {
    const style = styles[index]
    if (!style) return
    const joins = current && (sameRun(current.style, style) || (unit.digit && SHARED_DIGITS[style] === current.style)) && gapJoins(units, styles, current.to + 1, index)
    if (joins) {
      current.to = index
      // Una serie di sole cifre in grassetto che continua con lettere in grassetto corsivo era già in grassetto corsivo.
      if (current.onlyDigits && !unit.digit && SHARED_DIGITS[current.style] === style) current.style = style
      if (!unit.digit) current.onlyDigits = false
    } else {
      current = { style, from: index, to: index, onlyDigits: unit.digit }
      runs.push(current)
    }
  })
  return runs
}

// Sottolineato e barrato: le unità con il segno, unite attraverso gli spazi (lo stile non li segna mai).
function flagRuns(units, flag) {
  const runs = []
  let current = null
  units.forEach((unit, index) => {
    if (!unit[flag]) return
    let blank = Boolean(current)
    for (let at = (current ? current.to + 1 : 0); blank && at < index; at += 1) blank = /^[^\S\n]$/.test(units[at].plain)
    if (blank) current.to = index
    else { current = { from: index, to: index }; runs.push(current) }
  })
  return runs
}

/** I segni di ogni unità, ciascuno con l'indice dell'ultima unità del suo tratto: strong, em, code (dagli stili che li rappresentano), underline, strike. */
function unitMarks(units) {
  const marks = units.map(() => new Map())
  const add = (from, to, names) => { for (let index = from; index <= to; index += 1) for (const name of names) marks[index].set(name, to) }
  for (const run of styleRuns(units, inheritedStyles(units))) add(run.from, run.to, STYLE_MARK[run.style] || [])
  for (const flag of ['underline', 'strike']) for (const run of flagRuns(units, flag)) add(run.from, run.to, [flag])
  return marks
}

/** Analisi di un testo: le unità (carattere, lettera normale, stile, decorazioni) e gli stili usati, per sapere cosa c'è prima di convertire. */
function analyze(text) {
  const units = toUnits(text)
  const styles = new Set(units.filter((unit) => unit.style).map((unit) => unit.style))
  if (units.some((unit) => unit.underline)) styles.add('underline')
  if (units.some((unit) => unit.strike)) styles.add('strike')
  return { units, styles: [...styles] }
}

// ---------- Testo con lo stile → Markdown ----------

const ORDER = ['underline', 'strike', 'strong', 'em'] // dal segno più esterno al più interno
const OPEN = { underline: '<u>', strike: '~~', strong: '**', em: '*' }
const CLOSE = { underline: '</u>', strike: '~~', strong: '**', em: '*' }

const escapeMarkdown = (text) => text.replace(/[\\`*_[\]<~]/g, '\\$&').replace(/&(?=#?\w+;)/g, '\\&')
function codeSpan(text) {
  const longest = Math.max(0, ...(text.match(/`+/g) || []).map((run) => run.length))
  const fence = '`'.repeat(longest + 1)
  return `${fence}${/^`|`$/.test(text) ? ` ${text} ` : text}${fence}`
}

function unitText(unit, options, report) {
  if (unit.style && !STYLE_MARK[unit.style]) {
    // Uno stile senza equivalente in Markdown (corsivo calligrafico, fraktur, cerchiato…).
    if (options.unmapped === 'plain') report.lost.add(`style:${unit.style}`)
    else { report.kept.add(`style:${unit.style}`); return unit.char + unit.accents }
  }
  return unit.plain + unit.accents
}

// Il Markdown di una riga: ogni tratto con gli stessi segni si scrive con i suoi delimitatori, gli spazi ai bordi stanno fuori (il Markdown non li ammette dentro).
function inlineMarkdown(text, options, report) {
  const units = toUnits(text)
  const marks = unitMarks(units)
  const keyOf = (map) => [...map.keys()].sort().join('|')
  let out = ''
  let stack = []
  let pending = ''
  let index = 0
  while (index < units.length) {
    const key = keyOf(marks[index])
    let end = index
    while (end < units.length && keyOf(marks[end]) === key) end += 1
    const segment = units.slice(index, end).map((unit) => unitText(unit, options, report)).join('').normalize('NFC')
    const lead = segment.match(/^\s*/)[0]
    const core = segment.slice(lead.length).replace(/\s+$/, '')
    if (!core) {
      // Solo spazi: stanno fuori dai segni che non li coprono (uno spazio tra un corsivo e un grassetto corsivo non è in corsivo), dopo averli chiusi.
      let open = 0
      while (open < stack.length && marks[index].has(stack[open])) open += 1
      if (open < stack.length) {
        out += stack.slice(open).reverse().map((mark) => CLOSE[mark]).join('') + pending
        pending = ''
        stack = stack.slice(0, open)
      }
      pending += segment
      index = end
      continue
    }
    // Restano aperti i segni in cima alla pila che servono ancora; gli altri si chiudono. Quelli nuovi si aprono dal più duraturo: così un tratto più breve
    // (un sottolineato dentro un grassetto) sta dentro l'altro, senza spezzarlo.
    let keep = 0
    while (keep < stack.length && marks[index].has(stack[keep])) keep += 1
    const fresh = ORDER.filter((mark) => marks[index].has(mark) && !stack.slice(0, keep).includes(mark))
      .sort((left, right) => marks[index].get(right) - marks[index].get(left) || ORDER.indexOf(left) - ORDER.indexOf(right))
    out += stack.slice(keep).reverse().map((mark) => CLOSE[mark]).join('') + pending + lead + fresh.map((mark) => OPEN[mark]).join('')
    stack = [...stack.slice(0, keep), ...fresh]
    out += marks[index].has('code') ? codeSpan(core) : (options.escape ? escapeMarkdown(core) : core)
    pending = segment.slice(lead.length + core.length)
    index = end
  }
  return out + stack.reverse().map((mark) => CLOSE[mark]).join('') + pending
}

const BULLET = /^(\s*)[•◦▪▫‣⁃●○∙▸▹►▻]\s+/u
const TASK = /^(\s*)([☐☑☒✅✔])\s+/u
const ORDERED = /^(\s*\d+[.)]\s+)/
const QUOTE = /^(\s*>+\s?)/
const RULE = /^\s*(?:[─━]{3,}|-{3,}|_{3,}|\*{3,})\s*$/

// Una riga di sola punteggiatura (}, );, un fence…) non ha lettere da mettere in monospazio: dentro un blocco di codice resta com'è, e lo si riconosce dal contesto.
const isNeutralLine = (line) => line.trim() !== '' && !RULE.test(line) && !/[\p{L}\p{N}]/u.test(unstyle(line))

// Una riga scritta tutta in monospazio (almeno una lettera, e nessuna lettera o cifra con altro stile) è codice.
function isCodeLine(line) {
  const units = toUnits(line).filter((unit) => /[\p{L}\p{N}]/u.test(unit.plain))
  return units.length > 0 && units.every((unit) => unit.style === 'monospace')
}

/**
 * Da testo con lo stile a Markdown. Opzioni: `escape` (vero: il testo normale si protegge, *, _, `, [, <, ~ e un # o - a inizio riga non diventano formattazione;
 * falso: il testo che già usa le convenzioni del Markdown le conserva), `unmapped` ('keep': gli stili senza segno Markdown restano com'erano; 'plain': diventano
 * lettere normali), `hardBreaks` ('spaces' o 'backslash': come si conserva l'a capo dentro un paragrafo).
 */
function textToMarkdown(text, options = {}) {
  const opts = { escape: true, unmapped: 'keep', hardBreaks: 'spaces', ...options }
  const report = { lost: new Set(), kept: new Set() }
  const lines = normalizeNewlines(text).split('\n')
  const out = [] // { text, kind } : kind = 'blank' | 'paragraph' | 'quote' | 'list' | 'block'
  const push = (value, kind) => out.push({ text: value, kind })
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (line.trim() === '') { push('', 'blank'); index += 1; continue }

    // Due o più righe in monospazio: un blocco di codice.
    if (isCodeLine(line)) {
      const block = []
      let at = index
      while (at < lines.length) {
        if (isCodeLine(lines[at]) || (block.length && isNeutralLine(lines[at]))) { block.push(lines[at]); at += 1; continue }
        let next = at
        while (next < lines.length && lines[next].trim() === '') next += 1
        if (lines[at].trim() === '' && next < lines.length && isCodeLine(lines[next])) { for (; at < next; at += 1) block.push(''); continue }
        break
      }
      if (block.filter(Boolean).length >= 2) {
        const body = block.map(unstyle)
        const fence = body.some((row) => /^\s*```/.test(row)) ? '~~~' : '```'
        if (out.length && out[out.length - 1].kind !== 'blank') push('', 'blank')
        push(fence, 'block')
        for (const row of body) push(row, 'block')
        push(fence, 'block')
        index = at
        continue
      }
    }

    if (RULE.test(line)) {
      if (out.length && out[out.length - 1].kind !== 'blank') push('', 'blank') // senza riga vuota prima, il Markdown la prenderebbe per la sottolineatura di un titolo
      push('---', 'block')
      index += 1
      continue
    }

    let task = TASK.exec(line)
    let bullet = !task && BULLET.exec(line)
    const ordered = !task && !bullet && ORDERED.exec(line)
    const quote = !task && !bullet && !ordered && QUOTE.exec(line)
    if (task) push(`${task[1]}- [${task[2] === '☐' ? ' ' : 'x'}] ${inlineMarkdown(line.slice(task[0].length), opts, report)}`, 'list')
    else if (bullet) push(`${bullet[1]}- ${inlineMarkdown(line.slice(bullet[0].length), opts, report)}`, 'list')
    else if (ordered) push(`${ordered[1]}${inlineMarkdown(line.slice(ordered[0].length), opts, report)}`, 'list')
    else if (quote) push(`${quote[1]}${inlineMarkdown(line.slice(quote[0].length), opts, report)}`, 'quote')
    else {
      let body = line
      // Quattro spazi di rientro, fuori da un elenco, sarebbero un blocco di codice.
      if (/^ {4,}|^\t/.test(body) && out.length && out[out.length - 1].kind !== 'list') { body = body.replace(/^\s+/, ''); report.lost.add('indentation') }
      let markdown = inlineMarkdown(body, opts, report)
      if (opts.escape) markdown = markdown.replace(/^(\s*)#(?=\s)/, '$1\\#').replace(/^(\s*)([-+])(?=\s)/, '$1\\$2').replace(/^(\s*)=+\s*$/, (row) => row.replace('=', '\\='))
      push(markdown, 'paragraph')
    }
    index += 1
  }

  // Un a capo dentro un paragrafo (o una citazione) non è un paragrafo nuovo: nel Markdown va segnato, altrimenti le righe si unirebbero.
  const suffix = opts.hardBreaks === 'backslash' ? '\\' : '  '
  out.forEach((entry, position) => {
    const next = out[position + 1]
    if ((entry.kind === 'paragraph' || entry.kind === 'quote') && next && next.kind === entry.kind && !/\\$|  $/.test(entry.text)) entry.text += suffix
  })
  return { markdown: out.map((entry) => entry.text).join('\n'), lost: [...report.lost], kept: [...report.kept] }
}

// ---------- Markdown → testo con lo stile ----------

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&nbsp;': ' ' }
const unescapeHtml = (value) => String(value ?? '').replace(/&(?:amp|lt|gt|quot|#39|#x27|nbsp);/g, (entity) => ENTITIES[entity])
const BULLETS = ['•', '◦', '▪']
const RULE_TEXT = '──────────'

function styledSpan(text, state, options, report) {
  if (!text) return ''
  const family = FAMILY[options.family] || FAMILY.sans
  const ids = []
  if (state.code) ids.push('monospace')
  else if (state.strong && state.em) ids.push(family.both)
  else if (state.strong) ids.push(family.strong)
  else if (state.em) ids.push(family.em)
  if (state.del) ids.push('strike')
  if (state.underline) ids.push('underline')
  const alphabet = ids.find((id) => FORWARD.has(id))
  // Lettere senza variante (cinese, cirillico, greco, ß æ ø ł…): lo stile non ha effetto su di loro, e lo si dichiara.
  if (alphabet && [...text.normalize('NFD')].some((char) => /\p{L}/u.test(char) && !FORWARD.get(alphabet).has(char))) report.lost.add('style-unavailable')
  return ids.length ? stylize(text, ids, { accents: options.accents }) : text
}

function renderInline(tokens, state, options, report) {
  // `underline` cambia con <u> e </u>, che il lettore dà come due pezzi di HTML in linea: lo stato si porta avanti da un pezzo al successivo.
  const current = { ...state }
  return (tokens || []).map((token) => {
    switch (token.type) {
      case 'text':
      case 'escape':
        return token.tokens ? renderInline(token.tokens, current, options, report) : styledSpan(unescapeHtml(token.text), current, options, report)
      case 'strong': return renderInline(token.tokens, { ...current, strong: true }, options, report)
      case 'em': return renderInline(token.tokens, { ...current, em: true }, options, report)
      case 'del': return renderInline(token.tokens, { ...current, del: true }, options, report)
      case 'codespan': return styledSpan(unescapeHtml(token.text), { ...current, code: true }, options, report)
      case 'link': {
        const label = renderInline(token.tokens, current, options, report)
        const address = token.href || ''
        if (options.links === 'text' || !address) return label
        if (unstyle(label) === address) return label
        if (token.title) report.lost.add('link-title')
        return `${label} (${address})`
      }
      case 'image':
        report.lost.add('image')
        return styledSpan(unescapeHtml(token.text), current, options, report)
      case 'br': return '\n'
      case 'html': {
        const tag = String(token.text || token.raw).trim().toLowerCase()
        if (tag === '<u>') { current.underline = true; return '' }
        if (tag === '</u>') { current.underline = false; return '' }
        if (/^<br\s*\/?>$/.test(tag)) return '\n'
        report.lost.add('html')
        return ''
      }
      case 'footnoteRef': report.lost.add('footnote'); return token.raw
      case 'mathInline': report.lost.add('math'); return token.raw
      default: return ''
    }
  }).join('')
}

const indentLines = (text, first, rest) => text.split('\n').map((row, position) => (position === 0 ? first : rest) + row).join('\n')

function renderBlocks(tokens, options, report, level) {
  const blocks = []
  for (const token of tokens || []) {
    switch (token.type) {
      case 'paragraph':
      case 'text':
        blocks.push(token.tokens ? renderInline(token.tokens, {}, options, report) : styledSpan(unescapeHtml(token.text), {}, options, report))
        break
      case 'heading':
        report.lost.add('heading-level')
        blocks.push(renderInline(token.tokens, { strong: true }, options, report))
        break
      case 'code':
        if (token.lang) report.lost.add('code-language')
        blocks.push(String(token.text).split('\n').map((row) => stylize(row, 'monospace', { accents: options.accents })).join('\n'))
        break
      case 'blockquote':
        blocks.push(renderBlocks(token.tokens, options, report, level).join('\n\n').split('\n').map((row) => (row ? `> ${row}` : '>')).join('\n'))
        break
      case 'list': {
        const rows = token.items.map((item, position) => {
          const checkbox = (item.tokens || []).find((child) => child.type === 'checkbox')
          const marker = token.ordered ? `${(Number(token.start) || 1) + position}. ` : item.task ? (checkbox?.checked || item.checked ? '☑ ' : '☐ ') : `${BULLETS[Math.min(level, BULLETS.length - 1)]} `
          const inner = renderBlocks((item.tokens || []).filter((child) => child.type !== 'checkbox'), options, report, level + 1).join('\n')
          return indentLines(inner, marker, ' '.repeat(marker.length))
        })
        blocks.push(rows.join('\n'))
        break
      }
      case 'hr':
        blocks.push(RULE_TEXT)
        break
      case 'table': {
        report.lost.add('table')
        const cells = (row) => row.map((cell) => renderInline(cell.tokens, {}, options, report)).join(' | ')
        blocks.push([token.header.map((cell) => renderInline(cell.tokens, { strong: true }, options, report)).join(' | '), ...token.rows.map(cells)].join('\n'))
        break
      }
      case 'html':
        report.lost.add('html')
        blocks.push(String(token.text ?? token.raw).trim())
        break
      case 'frontMatter':
        report.lost.add('front-matter')
        break
      case 'footnoteDefinition':
        report.lost.add('footnote')
        blocks.push(token.text)
        break
      case 'mathBlock':
        report.lost.add('math')
        blocks.push(token.text)
        break
      default: // space, def…
        break
    }
  }
  return blocks.filter((block) => block !== '')
}

/**
 * Da Markdown a testo con lo stile Unicode. Opzioni: `family` ('sans' predefinito: 𝗴𝗿𝗮𝘀𝘀𝗲𝘁𝘁𝗼 e 𝘤𝘰𝘳𝘴𝘪𝘷𝘰 senza grazie; 'serif': 𝐠𝐫𝐚𝐬𝐬𝐞𝐭𝐭𝐨 e 𝑐𝑜𝑟𝑠𝑖𝑣𝑜), `links` ('inline': testo (indirizzo);
 * 'text': solo il testo), `accents` (come in stylize).
 */
function markdownToText(markdown, options = {}) {
  const opts = { family: 'sans', links: 'inline', accents: 'combine', ...options }
  const report = { lost: new Set(), kept: new Set() }
  const { tokens } = lex(markdown)
  const text = renderBlocks(tokens, opts, report, 0).join('\n\n')
  return { text, lost: [...report.lost], kept: [...report.kept] }
}

/**
 * Cosa passa da un lato all'altro. `back`: true = torna uguale; 'approx' = torna in una forma equivalente; false = non torna.
 * Serve a dirlo all'utente prima di convertire, e le prove lo controllano.
 */
const COVERAGE = [
  { id: 'strong', markdown: '**x**', text: 'bold (sans-serif or serif)', back: true },
  { id: 'em', markdown: '*x*', text: 'italic (sans-serif or serif)', back: true },
  { id: 'strong-em', markdown: '***x***', text: 'bold italic', back: true },
  { id: 'code', markdown: '`x`', text: 'monospace', back: true },
  { id: 'strike', markdown: '~~x~~', text: 'combining strikethrough', back: true },
  { id: 'underline', markdown: '<u>x</u>', text: 'combining underline', back: true },
  { id: 'accents', markdown: 'è à ü ñ', text: 'normal letters (the default of the app) or base letter styled + combining accent', back: true, loss: 'the combining accent is drawn badly by some programs (Notepad, for one), which is why the app leaves accented letters normal; with them normal, a word made only of accented letters cannot carry the style' },
  { id: 'punctuation', markdown: '. , ; ! ?', text: 'unchanged (no styled variants exist)', back: 'approx', loss: 'punctuation at the edge of a styled stretch comes back outside it' },
  { id: 'digits', markdown: '0-9', text: 'styled in bold and monospace; plain in italic', back: true },
  { id: 'heading', markdown: '# x', text: 'bold line', back: 'approx', loss: 'heading level' },
  { id: 'list', markdown: '- x', text: '• x (◦ ▪ for deeper levels)', back: true },
  { id: 'ordered-list', markdown: '1. x', text: '1. x', back: true },
  { id: 'task', markdown: '- [ ] x', text: '☐ x / ☑ x', back: true },
  { id: 'quote', markdown: '> x', text: '> x', back: true },
  { id: 'rule', markdown: '---', text: '──────────', back: true },
  { id: 'code-block', markdown: '```', text: 'monospace lines (two or more)', back: 'approx', loss: 'language; one line comes back as inline code' },
  { id: 'link', markdown: '[x](url)', text: 'x (url)', back: false, loss: 'the link becomes text' },
  { id: 'image', markdown: '![x](url)', text: 'x', back: false, loss: 'the image and its address' },
  { id: 'table', markdown: '| a | b |', text: 'rows with " | "', back: false, loss: 'the table structure' },
  { id: 'html', markdown: '<div>', text: 'dropped (kept as text for blocks)', back: false, loss: 'the markup' },
  { id: 'footnote-math', markdown: '[^1] $x$', text: 'raw text', back: 'approx', loss: 'they no longer behave as footnotes or formulas' },
  { id: 'other-scripts', markdown: '**日本語** **Привет** **ß**', text: 'unchanged', back: false, loss: 'bold, italic and the like have no effect on letters without a variant (CJK, Cyrillic, Greek, ß æ ø ł…)' },
  { id: 'other-styles', markdown: '—', text: 'script, fraktur, double-struck, circled, fullwidth, small caps, squared', back: 'approx', loss: 'no Markdown mark: kept as they are when going to Markdown' },
]

/**
 * Gli stili come si offrono nel menu del lettore testuale: prima i più usati, poi gli altri. Oltre agli alfabeti ci sono le due decorazioni, sottolineato e barrato.
 * Ogni voce: { id, label, group, marks } (`marks`: i segni Markdown che lo stile rappresenta, se ce ne sono).
 */
const STYLE_GROUPS = {
  common: ['sansBold', 'sansItalic', 'sansBoldItalic', 'monospace', 'underline', 'strike'],
  other: ['bold', 'italic', 'boldItalic', 'script', 'boldScript', 'fraktur', 'boldFraktur', 'doubleStruck', 'circled', 'fullwidth', 'smallCaps', 'squared', 'negativeSquared', 'sans'],
}
const DECORATION_LABELS = { underline: 'Underline', strike: 'Strikethrough' }
const DECORATION_MARKS = { underline: ['underline'], strike: ['strike'] }

function styleMenu() {
  const byId = new Map(STYLES.map((style) => [style.id, style]))
  return Object.entries(STYLE_GROUPS).flatMap(([group, ids]) => ids.map((id) => ({
    id,
    group,
    label: byId.get(id)?.label || DECORATION_LABELS[id],
    marks: byId.get(id)?.mark || DECORATION_MARKS[id] || [],
  })))
}

module.exports = { STYLES, STYLE_GROUPS, styleMenu, COVERAGE, stylize, applyStyle, unstyle, analyze, markdownToText, textToMarkdown }
