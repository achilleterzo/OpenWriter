const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/
const MAX_TITLE_CHARS = 200
const MAX_MESSAGE_CHARS = 200000

/**
 * Le conversazioni con l'assistente vivono in `<progetto>/.ow/chat/<id>.json`:
 *   { id, title, createdAt, updatedAt, parentId, branchedAt, contextFrom: [id…], messages: [{ role, content, at, error? }] }
 * `parentId` e `branchedAt` descrivono un ramo (indice dell'ultimo messaggio copiato dalla conversazione di origine);
 * `contextFrom` elenca altre conversazioni da fornire come contesto precedente.
 * Sono JSON leggibili: servono anche da log e possono essere versionati con il progetto.
 */
function createChatStore({ getProjectPath }) {
  const directory = () => {
    const project = getProjectPath()
    if (!project) throw new Error('Nessun progetto aperto')
    return path.join(project, '.ow', 'chat')
  }

  function fileFor(id) {
    if (!ID_PATTERN.test(String(id))) throw new Error('Identificativo di conversazione non valido')
    return path.join(directory(), `${id}.json`)
  }

  function writeAtomic(file, content) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const temporary = `${file}.tmp`
    fs.writeFileSync(temporary, content)
    fs.renameSync(temporary, file)
  }

  const text = (value, limit) => String(value ?? '').slice(0, limit)
  const optionalId = (value) => (typeof value === 'string' && ID_PATTERN.test(value) ? value : null)

  function normalize(input, existing = {}) {
    const now = new Date().toISOString()
    return {
      id: input.id,
      title: text(input.title ?? existing.title, MAX_TITLE_CHARS).trim() || 'Nuova conversazione',
      createdAt: existing.createdAt || input.createdAt || now,
      updatedAt: now,
      parentId: optionalId(input.parentId),
      branchedAt: Number.isInteger(input.branchedAt) ? input.branchedAt : null,
      contextFrom: [...new Set((Array.isArray(input.contextFrom) ? input.contextFrom : []).map(optionalId).filter(Boolean))].filter((id) => id !== input.id),
      messages: (Array.isArray(input.messages) ? input.messages : [])
        .filter((message) => message && (message.role === 'user' || message.role === 'assistant'))
        .map((message) => ({
          role: message.role,
          content: text(message.content, MAX_MESSAGE_CHARS),
          at: typeof message.at === 'string' ? message.at : now,
          ...(message.error ? { error: true } : {}),
        })),
    }
  }

  function readConversation(id) {
    const file = fileFor(id)
    if (!fs.existsSync(file)) throw new Error('Conversazione non trovata')
    try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { throw new Error(`${id}.json non è un JSON valido`) }
  }

  const summary = (conversation) => ({
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    parentId: conversation.parentId ?? null,
    branchedAt: conversation.branchedAt ?? null,
    messageCount: Array.isArray(conversation.messages) ? conversation.messages.length : 0,
  })

  function list() {
    let names = []
    try { names = fs.readdirSync(directory()) } catch { return [] }
    const conversations = []
    for (const name of names) {
      if (!name.endsWith('.json')) continue
      // Un file illeggibile non deve nascondere tutte le altre conversazioni.
      try { conversations.push(summary(JSON.parse(fs.readFileSync(path.join(directory(), name), 'utf8')))) } catch {}
    }
    return conversations.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
  }

  function create(input = {}) {
    // Id ordinabile per data: gli elenchi su disco restano cronologici anche senza leggerli.
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
    const id = `${stamp}-${crypto.randomBytes(3).toString('hex')}`
    const conversation = normalize({ ...input, id })
    writeAtomic(fileFor(id), JSON.stringify(conversation, null, 2))
    return conversation
  }

  function save(input) {
    const file = fileFor(input?.id)
    let existing = {}
    if (fs.existsSync(file)) existing = readConversation(input.id)
    const conversation = normalize(input, existing)
    writeAtomic(file, JSON.stringify(conversation, null, 2))
    return conversation
  }

  function remove(id) {
    fs.rmSync(fileFor(id), { force: true })
    return true
  }

  function ensureDirectory() {
    fs.mkdirSync(directory(), { recursive: true })
    return directory()
  }

  return { list, get: readConversation, create, save, remove, ensureDirectory }
}

module.exports = { createChatStore }
