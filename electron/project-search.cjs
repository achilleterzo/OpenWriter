const fs = require('node:fs')
const path = require('node:path')
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads')

/**
 * Ricerca nei file di un progetto, letterale o con espressione regolare: è la stessa per l'assistente interno e per il server MCP.
 * Restituisce l'elenco dei file che contengono il testo (output "files", il più economico: poi si leggono solo quelli), le righe (output "lines",
 * con contesto facoltativo) o solo i conti (output "count"). Salta `.ow`, `.git`, `node_modules`, le cartelle nascoste, i file troppo grandi e i binari.
 *
 * Una regex può essere catastrofica (backtracking): si esegue in un worker che si interrompe dopo REGEX_TIMEOUT_MS. Se il worker non parte
 * (ambiente senza worker_threads) si cerca nel thread, rifiutando i pattern con quantificatori annidati.
 */
const SKIPPED_NAMES = new Set(['.ow', '.git', 'node_modules'])
const DEFAULT_EXTENSIONS = /\.(md|markdown|mdown|txt)$/i
const MAX_FILE_BYTES = 2 * 1024 * 1024
// Abbastanza per un'alternanza di decine di nomi (un inventario: a|b|c|…); la regex gira comunque in un worker con scadenza.
const MAX_PATTERN_CHARS = 2000
const DEFAULT_RESULTS = 50
const MAX_RESULTS = 500
const MAX_CONTEXT = 5
const MAX_LINE_CHARS = 240
const MAX_OUTPUT_CHARS = 30000
const MAX_VISITED_FILES = 20000
const REGEX_TIMEOUT_MS = 10000

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// "*.md, src/**/*.js" → espressioni regolari: senza "/" si confronta il nome del file, altrimenti il percorso relativo.
function globMatchers(glob) {
  return String(glob || '').split(',').map((item) => item.trim()).filter(Boolean).map((item) => {
    const byPath = item.includes('/')
    const source = escapeRegExp(item.replace(/\\/g, '/')).replace(/\\\*\\\*\//g, '(?:.*/)?').replace(/\\\*\\\*/g, '.*').replace(/\\\*/g, '[^/]*').replace(/\\\?/g, '[^/]')
    return { byPath, expression: new RegExp(`^${source}$`, 'i') }
  })
}

function buildExpression({ pattern, regex, caseSensitive }) {
  const source = String(pattern ?? '')
  if (!source.trim()) throw new Error('The pattern is empty')
  if (source.length > MAX_PATTERN_CHARS) throw new Error(`The pattern is too long (at most ${MAX_PATTERN_CHARS} characters): split it into several searches`)
  try { return new RegExp(regex ? source : escapeRegExp(source), caseSensitive ? '' : 'i') } catch (error) { throw new Error(error.message.startsWith('Invalid regular expression') ? error.message : `Invalid regular expression: ${error.message}`) }
}

// Quantificatore dentro un gruppo che a sua volta è quantificato, per esempio (a+)+ : tipico del backtracking esponenziale.
const NESTED_QUANTIFIER = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/

function runSearch(options) {
  const { root, start, output = 'files', context = 0, regex = false } = options
  const expression = buildExpression(options)
  const mode = ['files', 'lines', 'count'].includes(output) ? output : 'files'
  const limit = Math.min(MAX_RESULTS, Math.max(1, Math.round(Number(options.maxResults)) || DEFAULT_RESULTS))
  const around = Math.min(MAX_CONTEXT, Math.max(0, Math.round(Number(context)) || 0))
  const matchers = globMatchers(options.glob)
  // Testo non ancora salvato dei documenti aperti nell'editor ({ path, text }): vale al posto del file su disco, che è più vecchio.
  const key = (file) => (process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file))
  const unsaved = new Map((Array.isArray(options.overrides) ? options.overrides : []).filter((item) => item && item.path && typeof item.text === 'string').map((item) => [key(item.path), item.text]))
  let unsavedUsed = 0
  const results = []
  let filesSearched = 0
  let filesMatched = 0
  let totalMatches = 0
  let visited = 0
  let truncated = false
  let characters = 0
  const relative = (file) => path.relative(root, file).split(path.sep).join('/')

  const accept = (file, name) => {
    if (!matchers.length) return DEFAULT_EXTENSIONS.test(name)
    return matchers.some((matcher) => matcher.expression.test(matcher.byPath ? relative(file) : name))
  }

  // Una riga lunga (un paragrafo) si mostra attorno alla prima corrispondenza, non dall'inizio: altrimenti la parola trovata può restare fuori dal taglio.
  const snippet = (line) => {
    const trimmed = line.trim()
    if (trimmed.length <= MAX_LINE_CHARS) return trimmed
    const found = expression.exec(trimmed)
    if (!found || found.index + found[0].length <= MAX_LINE_CHARS - 20) return trimmed.slice(0, MAX_LINE_CHARS)
    const from = Math.max(0, found.index - 100)
    const to = Math.min(trimmed.length, found.index + Math.max(found[0].length, 1) + (MAX_LINE_CHARS - 100))
    return `${from > 0 ? '…' : ''}${trimmed.slice(from, to)}${to < trimmed.length ? '…' : ''}`
  }

  const searchFile = (file) => {
    let content = unsaved.get(key(file))
    if (content !== undefined) unsavedUsed += 1
    else {
      let buffer
      try {
        if (fs.statSync(file).size > MAX_FILE_BYTES) return
        buffer = fs.readFileSync(file)
      } catch { return }
      if (buffer.subarray(0, 4096).includes(0)) return
      content = buffer.toString('utf8')
    }
    filesSearched += 1
    const lines = content.split(/\r?\n/)
    const hits = []
    for (let index = 0; index < lines.length; index += 1) if (expression.test(lines[index])) hits.push(index)
    if (!hits.length) return
    filesMatched += 1
    totalMatches += hits.length
    if (mode === 'count') return
    const name = relative(file)
    if (mode === 'files') {
      if (results.length < limit) results.push({ path: name, matches: hits.length })
      else truncated = true
      return
    }
    for (const index of hits) {
      if (results.length >= limit || characters > MAX_OUTPUT_CHARS) { truncated = true; return }
      const clip = (line) => line.trim().slice(0, MAX_LINE_CHARS)
      const entry = { path: name, line: index + 1, text: snippet(lines[index]) }
      if (around) {
        entry.before = lines.slice(Math.max(0, index - around), index).map(clip)
        entry.after = lines.slice(index + 1, index + 1 + around).map(clip)
      }
      characters += entry.text.length + (entry.before || []).concat(entry.after || []).join('').length + name.length + 20
      results.push(entry)
    }
  }

  const walk = (directory) => {
    let entries = []
    try { entries = fs.readdirSync(directory, { withFileTypes: true }) } catch { return }
    entries.sort((left, right) => left.name.localeCompare(right.name))
    for (const entry of entries) {
      if (visited > MAX_VISITED_FILES) { truncated = true; return }
      if (SKIPPED_NAMES.has(entry.name) || entry.name.startsWith('.')) continue
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (accept(full, entry.name)) { visited += 1; searchFile(full) }
    }
  }

  if (regex && NESTED_QUANTIFIER.test(String(options.pattern)) && options.guardNested) throw new Error('This regular expression can take exponential time (a quantified group with a quantifier inside): simplify it')
  let isFile = false
  try { isFile = fs.statSync(start).isFile() } catch { /* cartella */ }
  if (isFile) searchFile(start); else walk(start)
  // Un testo letterale con i simboli di una regex senza risultati: probabilmente era un'espressione regolare.
  const hint = !regex && totalMatches === 0 && /[|()[\]\\^$*+?]/.test(String(options.pattern)) ? 'No literal matches. The pattern contains regular-expression symbols: if you meant a regular expression (for example a|b), pass regex=true.' : ''
  return { pattern: String(options.pattern), regex: Boolean(regex), output: mode, filesSearched, filesMatched, totalMatches, ...(unsavedUsed ? { unsavedEditsIncluded: unsavedUsed } : {}), ...(mode === 'count' ? {} : { shown: results.length, results }), ...(hint ? { hint } : {}), ...(truncated ? { truncated: true, note: 'The result was cut: narrow it with path, glob or a more specific pattern, or raise maxResults' } : {}) }
}

// Dentro un worker: si esegue la ricerca e si risponde al thread principale.
if (!isMainThread && workerData?.type === 'project-search') {
  try { parentPort.postMessage({ ok: true, value: runSearch(workerData.options) }) } catch (error) { parentPort.postMessage({ ok: false, error: error.message }) }
}

function searchFiles(input) {
  // Senza `regex` esplicito, un pattern con "|" (alternanza a|b) o con simboli che solo una regex usa (\s \w \d , .* .+, [^…], (?:…)) si legge come
  // espressione regolare e il risultato lo dice; `regex: false` forza il testo letterale.
  const options = { ...input }
  let autoRegex = false
  if (options.regex === undefined || options.regex === null || options.regex === '') {
    autoRegex = /\||\\[swdbSWDB]|\.[*+]|\[\^|\(\?[:=!]/.test(String(options.pattern ?? ''))
    options.regex = autoRegex
  }
  const mark = (result) => (autoRegex ? { ...result, autoRegex: true } : result)
  // Il testo semplice non può essere catastrofico: nel thread. La regex va in un worker con scadenza.
  if (!options.regex) return Promise.resolve().then(() => runSearch(options))
  buildExpression(options)
  return new Promise((resolve, reject) => {
    let worker
    try { worker = new Worker(__filename, { workerData: { type: 'project-search', options } }) } catch {
      try { resolve(mark(runSearch({ ...options, guardNested: true }))) } catch (error) { reject(error) }
      return
    }
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('The search took too long and was stopped: simplify the regular expression or narrow the search')) }, REGEX_TIMEOUT_MS)
    worker.once('message', (message) => { clearTimeout(timer); worker.terminate(); if (message.ok) resolve(mark(message.value)); else reject(new Error(message.error)) })
    worker.once('error', (error) => { clearTimeout(timer); reject(error) })
  })
}

// Testo per un modello: una riga per file ("percorso (N)"), o per corrispondenza ("percorso:riga: testo"), con il contesto indentato.
function formatSearch(result) {
  const head = `${result.totalMatches} matches in ${result.filesMatched} files (${result.filesSearched} files searched${result.unsavedEditsIncluded ? `, ${result.unsavedEditsIncluded} with unsaved edits from the editor` : ''}) for ${result.regex ? 'regex' : 'text'} “${result.pattern}”${result.autoRegex ? ' (read as a regular expression because it contains regex symbols; pass regex=false for the literal text)' : ''}`
  if (result.output === 'count') return `${head}${result.hint ? `. ${result.hint}` : ''}`
  if (!result.results.length) return `${head}.${result.hint ? ` ${result.hint}` : ''}`
  const body = result.results.map((entry) => {
    if (result.output === 'files') return `${entry.path} (${entry.matches})`
    return [...(entry.before || []).map((line) => `  ${entry.path}-  ${line}`), `${entry.path}:${entry.line}: ${entry.text}`, ...(entry.after || []).map((line) => `  ${entry.path}-  ${line}`)].join('\n')
  })
  return [head, ...body, result.truncated ? `… ${result.note}` : ''].filter(Boolean).join('\n')
}

module.exports = { searchFiles, formatSearch }
