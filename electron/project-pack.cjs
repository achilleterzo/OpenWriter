const fs = require('node:fs')
const path = require('node:path')
const { t } = require('./i18n.cjs')
const { writeFileAtomic } = require('./atomic-write.cjs')

/**
 * Configurazione condivisibile di un progetto: tutto ciò che in `.ow` definisce *come si lavora* nel progetto, in un solo file JSON che si passa ad altri.
 *   - contesto per l'assistente (context.md) e gli altri file di istruzioni (.md nella radice di .ow)
 *   - skill di scrittura del progetto (.ow/skills/<id>.md)
 *   - impostazioni: lingua delle risposte e dei documenti, versioni automatiche, lingue del correttore, carattere dell'editor, skill attive di default
 * Restano fuori cronologia, conversazioni, note, memoria, collegamenti, riferimenti, icona e nome del progetto: sono lavoro o identità, non metodo.
 */
const FORMAT = 'openwriter-project-setup'
const VERSION = 1
const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_TEXT_CHARS = 20000
const MAX_ITEMS = 50
const SKILL_ID = /^[a-z0-9][a-z0-9-]{0,59}$/

const readText = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n')

// Nome di un file di istruzioni: un .md semplice nella radice di .ow (context.md è riservato: sta nel campo `context`).
const validInstructionName = (name) => typeof name === 'string' && /^[^\\/:*?"<>|\r\n]{1,100}\.md$/i.test(name) && !name.startsWith('.') && name.toLowerCase() !== 'context.md'
const validSkillName = (name) => typeof name === 'string' && /\.md$/i.test(name) && SKILL_ID.test(name.slice(0, -3))

// `settings`: quello che restituisce getSettings() del progetto; `directory`: la sua cartella.
function buildPack({ settings, directory, appVersion = '' }) {
  const skillsDirectory = path.join(directory, '.ow', 'skills')
  let skillNames = []
  try { skillNames = fs.readdirSync(skillsDirectory).filter(validSkillName).sort((left, right) => left.localeCompare(right)).slice(0, MAX_ITEMS) } catch { /* nessuna skill */ }
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    app: appVersion ? `OpenWriter ${appVersion}` : 'OpenWriter',
    settings: {
      ai: { language: settings.ai.language || '', documentLanguage: settings.ai.documentLanguage || '' },
      options: { autoVersions: settings.options.autoVersions !== false },
      spellcheck: { languages: settings.spellcheck.languages || [] },
      editor: { font: settings.editor?.font || '', fontFamily: settings.editor?.fontFamily || '' },
      skills: { active: settings.skills?.active || [] },
    },
    context: String(settings.ai.context || ''),
    instructionFiles: (settings.ai.extraContext || []).map((item) => ({ name: item.name, text: item.text })),
    skills: skillNames.map((name) => ({ name, text: readText(path.join(skillsDirectory, name)).slice(0, MAX_TEXT_CHARS) })),
  }
}

// Legge e controlla un file di configurazione: restituisce il pacchetto ripulito o lancia un errore comprensibile.
function parsePack(source) {
  if (Buffer.byteLength(source, 'utf8') > MAX_FILE_BYTES) throw new Error(t('The setup file is too large'))
  let data
  try { data = JSON.parse(source) } catch { throw new Error(t('This is not a valid OpenWriter project setup file')) }
  if (!data || data.format !== FORMAT) throw new Error(t('This is not a valid OpenWriter project setup file'))
  if (!Number.isInteger(data.version) || data.version > VERSION) throw new Error(t('This setup file comes from a newer version of OpenWriter'))
  const text = (value) => String(value ?? '').replace(/\r\n?/g, '\n').slice(0, MAX_TEXT_CHARS)
  const settings = data.settings && typeof data.settings === 'object' ? data.settings : {}
  const list = (value) => (Array.isArray(value) ? value : []).slice(0, MAX_ITEMS)
  return {
    exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : '',
    app: typeof data.app === 'string' ? data.app.slice(0, 60) : '',
    settings: {
      ai: { language: String(settings.ai?.language || '').slice(0, 50), documentLanguage: String(settings.ai?.documentLanguage || '').slice(0, 50) },
      options: { autoVersions: settings.options?.autoVersions !== false },
      spellcheck: { languages: list(settings.spellcheck?.languages).filter((item) => typeof item === 'string' && /^[A-Za-z]{2,3}([-_][A-Za-z0-9]{2,8})?$/.test(item)) },
      editor: { font: settings.editor?.font, fontFamily: settings.editor?.fontFamily },
      skills: { active: list(settings.skills?.active).filter((item) => typeof item === 'string' && SKILL_ID.test(item)) },
    },
    context: text(data.context),
    instructionFiles: list(data.instructionFiles).filter((item) => item && validInstructionName(item.name)).map((item) => ({ name: item.name, text: text(item.text) })),
    skills: list(data.skills).filter((item) => item && validSkillName(item.name)).map((item) => ({ name: item.name, text: text(item.text) })),
  }
}

// Riepilogo mostrato prima di importare.
const summarize = (pack) => ({
  exportedAt: pack.exportedAt,
  app: pack.app,
  contextCharacters: pack.context.length,
  instructionFiles: pack.instructionFiles.map((item) => item.name),
  skills: pack.skills.map((item) => item.name.replace(/\.md$/i, '')),
  hasSettings: true,
})

/**
 * Applica la configurazione a un progetto, come la copia del contesto: il contesto sostituisce o si aggiunge (`mode`), i file di istruzioni e le skill
 * si scrivono se non esistono già (con `overwrite` si sostituiscono). Con `applySettings` si adottano anche le impostazioni (il nome del progetto resta quello).
 * `file`: createProjectFile del progetto di destinazione; `directory`: la sua cartella.
 */
function applyPack({ pack, file, directory, mode = 'replace', overwrite = false, applySettings = true }) {
  file.initialize()
  const current = file.getSettings()
  const root = path.join(directory, '.ow')
  const existing = String(current.ai.context || '')
  const incoming = pack.context
  const context = incoming.trim() ? (mode === 'append' && existing.trim() ? `${existing.trimEnd()}\n\n${incoming}`.slice(0, MAX_TEXT_CHARS) : incoming) : existing

  let written = 0
  let skipped = 0
  const put = (target, content) => {
    if (fs.existsSync(target) && !overwrite) { skipped += 1; return }
    fs.mkdirSync(path.dirname(target), { recursive: true })
    writeFileAtomic(target, content)
    written += 1
  }
  for (const item of pack.instructionFiles) put(path.join(root, item.name), item.text)
  for (const item of pack.skills) put(path.join(root, 'skills', item.name), item.text)

  const settings = applySettings ? pack.settings : null
  const incomingActive = settings ? settings.skills.active : null
  file.saveSettings({
    name: current.name,
    ai: { context, language: settings ? settings.ai.language : current.ai.language, documentLanguage: settings ? settings.ai.documentLanguage : current.ai.documentLanguage },
    options: settings ? settings.options : current.options,
    spellcheck: settings ? settings.spellcheck : current.spellcheck,
    ...(settings ? { editor: settings.editor } : {}),
    ...(incomingActive ? { skills: { active: mode === 'append' ? [...new Set([...(current.skills?.active || []), ...incomingActive])] : incomingActive } } : {}),
  })
  return { contextCharacters: file.getSettings().ai.context.length, written, skipped, settingsApplied: Boolean(settings) }
}

module.exports = { buildPack, parsePack, summarize, applyPack }
