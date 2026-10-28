import { createToolRunner, parseToolCall, toolSchemas, visibleText } from './aiTools.js'
import { t } from '../i18n/index.js'

/**
 * Assistente di ricerca: un secondo modello (impostazioni → assistente di ricerca) che l'assistente principale chiama come strumento (`research`)
 * per esplorare il progetto. Lavora a parte, con i soli strumenti di lettura (search_files, list_directory, read_file, list_versions, read_version),
 * e restituisce un rapporto breve con percorsi e righe: l'esplorazione, con le sue tante letture, resta fuori dal contesto del principale.
 * Non scrive nulla e non mostra nulla nella chat, se non lo stato ("Ricerca…") e il rapporto come risultato dello strumento.
 */
const READ_ONLY_TOOLS = new Set(['search_files', 'list_directory', 'read_file', 'list_versions', 'read_version'])
const KEEP_FULL_RESULTS = 6
const OLD_RESULT_CHARS = 500
const MAX_REPORT_CHARS = 8000
const MAX_RESULT_CHARS = 12000

const SYSTEM_PROMPT = [
  'You are the research assistant of OpenWriter, a Markdown document editor. Another assistant gives you a question about the project: your job is to find the files and passages that answer it, using ONLY your read-only tools, and to report back. You never change anything.',
  'Tools: search_files (start with output=files to see which files contain something; then output=lines with a little context to judge them; a pattern like a|b is read as alternatives), list_directory (recursive by default: one call shows the whole tree), read_file (read only the lines you need with startLine/endLine around a match, not whole files unless they are small).',
  'IMPORTANT: search_files looks only in .md, .markdown and .txt files unless you pass glob. To search source code pass glob, for example "*.js, *.jsx, *.cjs" (or "src/**/*.js"); to search everything relevant, pass both documentation and code: "*.md, *.js, *.jsx, *.cjs". When the question is about how something works, look in the code, not only in the documentation, and quote file and line numbers of the code.',
  'Work efficiently: a few well-aimed searches beat many readings. Search for synonyms and related words when the first search finds little. Do not open a file to check something a search with context already shows. Never run the same search twice: remember what you already found. For an inventory or a comparison ("list X and which are missing from Y"), first get the exact list from one source (one search with output=lines or one read), then check every item against the other source with a few searches that use alternatives (a|b|c), and report exact counts and the exact names, not approximations. NUMBER every item of a list (1., 2., 3., …) and give the total as the last number: never add counts in your head.',
  'Be thorough before saying something is not there: when the question is about how something works in the project, search ALL the places where it could live (documentation in docs/, and the code in every source folder: src/, electron/, and any other you see in the tree) and read the passages that matter, not just the first matches. Do not stop at the first few findings.',
  'Never guess: every finding must cite the file path and the line numbers exactly as you saw them. If something is not in the project, say so. Report only what you read: describe what the lines say, and do NOT infer what a function does, who calls it or when it runs from its name or from a comment you did not read around; when you are not sure, write "(not verified)" after the finding.',
  'When you have enough, answer WITHOUT calling a tool, with a concise report (at most about 400 words, no preamble, no advice on what to do): first the findings as a list "path:lines — what it says or why it matters", then a line "Not found:" for what you could not find (omit it if nothing is missing), and a last line "Searched: …" listing the folders and file types you searched, so the reader knows where there are no gaps.',
].join('\n')

// Risultati vecchi ridotti all'inizio: il rapporto non ne ha bisogno e il contesto del ricercatore resta piccolo.
function prune(messages) {
  const tools = messages.map((message, index) => (message.role === 'tool' ? index : -1)).filter((index) => index >= 0)
  const old = new Set(tools.slice(0, Math.max(0, tools.length - KEEP_FULL_RESULTS)))
  return messages.map((message, index) => (old.has(index) && message.content.length > OLD_RESULT_CHARS ? { ...message, content: `${message.content.slice(0, OLD_RESULT_CHARS)}\n[… earlier result shortened]` } : message))
}

const brief = (name, args) => {
  const first = args?.pattern ?? args?.path ?? args?.id ?? ''
  return `${name}${first ? ` ${String(first).slice(0, 50)}` : ''}`
}

/**
 * `settings.researcher`: { provider, model, maxSteps }. `chat`: electronAPI.ai (chatStream). `onStatus(text)` aggiorna lo stato mostrato in chat,
 * `register(cancel)` dà all'interfaccia come interrompere la richiesta in corso, `isCancelled()` dice se l'utente ha interrotto.
 */
export async function runResearch({ question, scope = '', settings, api, chat, project, toolBridge, onStatus = () => {}, register = () => {}, isCancelled = () => false }) {
  const { provider, model, maxSteps } = settings.researcher
  const runTool = createToolRunner({
    api,
    project,
    enabled: { files: true },
    getDocument: (path) => toolBridge.getDocument(path),
    getOpenDocumentText: (path) => toolBridge.getOpenDocumentText(path),
    getDirtyDocuments: () => toolBridge.getDirtyDocuments(),
  })
  const tools = toolSchemas({ files: true })
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: `${question.trim()}${scope.trim() ? `\n\nLook only in: ${scope.trim()}` : ''}` }]
  const usage = { input: 0, output: 0 }
  const steps = []

  // Una richiesta al modello di ricerca (sempre con ragionamento ridotto: serve rapidità, non pianificazione).
  async function ask(withTools) {
    const request = chat.chatStream(prune(messages), (event) => {
      if (event.type === 'usage') { usage.input += event.input || 0; usage.output += event.output || 0 }
    }, { ...(withTools ? { tools } : {}), reasoningCap: 'low', use: { provider, model } })
    register(request.cancel)
    return request.promise
  }

  let report = ''
  let empty = 0
  let forced = false
  for (let step = 0; step <= maxSteps; step += 1) {
    if (isCancelled()) throw new Error(t('Request interrupted'))
    const last = step === maxSteps
    if (last) messages.push({ role: 'user', content: 'You have used all your steps. Write the final report now with what you found, without calling any tool.' })
    onStatus(t('Researching… (step {step})', { step: step + 1 }))
    const reply = await ask(!last)
    const parsed = last ? null : parseToolCall(reply)
    if (!parsed) {
      report = visibleText(reply).text.trim() || reply.trim()
      if (report) break
      // Risposta vuota (capita con alcuni modelli dopo il ragionamento): si richiama con un invito esplicito, una volta per volta fino a due; poi si chiede il rapporto.
      empty += 1
      messages.push({ role: 'user', content: empty > 2 ? 'Your reply was empty again. Write the final report now with what you found so far, without calling any tool.' : 'Your reply was empty. Call a tool, or write the final report now.' })
      if (empty > 2) { forced = true; break }
      continue
    }
    if (parsed.error) {
      messages.push({ role: 'assistant', content: reply }, { role: 'user', content: parsed.error })
      continue
    }
    const { name, arguments: args } = parsed.call
    steps.push(brief(name, args))
    onStatus(t('Researching: {step}', { step: brief(name, args) }))
    let result
    if (!READ_ONLY_TOOLS.has(name)) result = `Tool "${name}" is not available: use only ${[...READ_ONLY_TOOLS].join(', ')}.`
    else {
      try {
        const outcome = await runTool(name, args)
        result = typeof outcome === 'string' ? outcome : outcome.text
      } catch (reason) {
        result = `Error: ${reason.message}`
      }
    }
    messages.push(
      { role: 'assistant', content: visibleText(reply).text, tool_calls: [{ function: { name, arguments: args } }] },
      { role: 'tool', tool_name: name, content: String(result).slice(0, MAX_RESULT_CHARS) },
    )
  }

  // Nessun rapporto dopo le risposte vuote: un'ultima richiesta senza strumenti, con tutto ciò che si è letto.
  if (!report && (forced || steps.length)) {
    if (!forced) messages.push({ role: 'user', content: 'Write the final report now with what you found, without calling any tool.' })
    onStatus(t('Researching… (report)'))
    const reply = await ask(false)
    report = visibleText(reply).text.trim() || reply.trim()
  }
  const body = report.length > MAX_REPORT_CHARS ? `${report.slice(0, MAX_REPORT_CHARS)}\n[… report cut]` : report
  const footer = `[Research assistant: ${model}, ${steps.length} steps (${steps.slice(0, 8).join('; ')}${steps.length > 8 ? '; …' : ''}); ↑${usage.input} ↓${usage.output} tokens. It reads only: paths and lines are reliable, interpretations may not be: verify the few points that matter with read_file startLine/endLine.]`
  return `${body || 'The research assistant returned no report.'}\n\n${footer}`
}
