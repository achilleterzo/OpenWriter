import { articleToMarkdown, extractArticle } from './readerMode.js'
import { publicWebAddress } from './webAddress.js'
import { t } from '../i18n/index.js'

/**
 * Riferimenti web: salvare una pagina come copia in Markdown nel progetto (vedi electron/web-references.cjs) e rinfrescarla. Un'unica via per tutti: la stellina del
 * browser (l'utente), gli strumenti dell'assistente e quelli degli agenti esterni (MCP). La pagina si legge nel browser dell'app, quindi con gli script eseguiti, come
 * la vede l'utente; le richieste di assistente e agenti usano una scheda in secondo piano che non disturba quella dell'utente.
 */
export const CAPTURE_SCRIPT = '({ html: document.documentElement.outerHTML, url: location.href, title: document.title, text: document.body ? document.body.innerText : "" })'
export const WEB_REFERENCES_CHANGED = 'openwriter:web-references-changed'

// Ciò che la pagina ha restituito (CAPTURE_SCRIPT) → { url, title, markdown, siteName }. Come la vista lettura: l'articolo estratto; se non ce n'è uno, il testo della pagina.
export function pageToReference(page) {
  if (!/^https?:/i.test(page.url)) throw new Error(t('Only web pages (http or https) can be saved'))
  const article = extractArticle(page.html, page.url)
  const title = (article?.title || page.title || new URL(page.url).hostname).trim()
  const markdown = article ? articleToMarkdown(article, { sourceLabel: t('Source') }) : `# ${title}\n\n> ${t('Source')}: <${page.url}>\n\n${String(page.text || '').trim()}\n`
  return { url: page.url, title, markdown, siteName: article?.siteName || '' }
}

const announce = () => { try { window.dispatchEvent(new CustomEvent(WEB_REFERENCES_CHANGED)) } catch { /* senza finestra non c'è nessuno da avvisare */ } }

// Salva (o rinfresca) la pagina che sta in questo momento in un controller del browser. `matchUrl`: l'indirizzo della copia da rinfrescare, se la pagina è stata
// reindirizzata altrove.
export async function saveFromController(api, controller, { source = 'user', checkOnly = false, matchUrl = '' } = {}) {
  const page = await controller.evaluate(CAPTURE_SCRIPT)
  const reference = pageToReference(page)
  const entry = await api.webRefs.save({ ...reference, url: matchUrl || reference.url, source, checkOnly })
  announce()
  return entry
}

// La scheda del browser in secondo piano per assistente e agenti: si crea la prima volta e si riusa (se l'utente la chiude se ne apre un'altra).
let captureTabId = null
async function captureController(getBrowser) {
  if (captureTabId) {
    try { return await getBrowser({ tab: captureTabId, create: false, activate: false }) } catch { captureTabId = null }
  }
  const target = await getBrowser({ newTab: true, activate: false })
  captureTabId = target.id
  return target
}

// Apre l'indirizzo in segreto e lo salva. → la voce (con `change`: created | updated | unchanged).
export async function saveFromUrl({ api, getBrowser }, url, { source = 'assistant' } = {}) {
  const address = publicWebAddress(url).href
  const target = await captureController(getBrowser)
  await target.controller.navigate(address)
  return saveFromController(api, target.controller, { source })
}

// Rinfresca una pagina già salvata: la riapre, confronta e (se non `checkOnly`) aggiorna la copia. `reference`: id, nome del file, indirizzo o parte del titolo.
export async function refreshReference({ api, getBrowser }, reference, { checkOnly = false, source = 'assistant' } = {}) {
  const list = await api.webRefs.list()
  const wanted = String(reference ?? '').trim()
  const lower = wanted.toLowerCase().replace(/^@web\//, '')
  const entry = list.find((item) => item.id === wanted || item.file.toLowerCase() === lower) || list.find((item) => item.url === wanted) || list.find((item) => item.title.toLowerCase().includes(lower) || item.url.toLowerCase().includes(lower))
  if (!entry) throw new Error(`No saved web page matches "${wanted}": the saved pages are listed in the conversation (and in .ow/web.json); use save_web_reference to save a new one`)
  const address = publicWebAddress(entry.url).href
  const target = await captureController(getBrowser)
  await target.controller.navigate(address)
  return saveFromController(api, target.controller, { source, checkOnly, matchUrl: entry.url })
}

const day = (iso) => String(iso || '').slice(0, 10)

// La risposta per il modello (assistente o agente) dopo un salvataggio o una verifica.
export function describeSavedReference(entry) {
  const where = `@web/${entry.file}`
  const diff = entry.diff ? ` (${entry.diff.added} lines added, ${entry.diff.removed} lines removed)` : ''
  switch (entry.change) {
    case 'created': return `Saved "${entry.title}" as ${where} (${entry.url}). It is now part of the project context: read it with read_file, find passages with search_knowledge. Its header records the dates; refresh it later with refresh_web_reference if it may be out of date.`
    case 'updated': return `Updated ${where}: the page had changed since ${day(entry.savedAt)}${diff}. The saved copy is now current (${day(entry.updatedAt)}).`
    case 'changed': return `The page ${where} has CHANGED since the copy was saved/updated on ${day(entry.updatedAt)}${diff}. The saved copy was NOT updated: call refresh_web_reference again without check_only to update it.`
    default: return `${where} is up to date: the page has not changed since ${day(entry.updatedAt)} (verified now).`
  }
}
