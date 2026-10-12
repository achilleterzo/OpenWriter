const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { t } = require('./i18n.cjs')

const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/
const MAX_TITLE_CHARS = 200
const MAX_MESSAGE_CHARS = 200000

/**
 * Le conversazioni con l'assistente vivono in `<progetto>/.ow/chat/<id>.json`:
 *   { id, title, createdAt, updatedAt, parentId, branchedAt, contextFrom: [id…], messages: [{ role, content, at, error?, thinking?, name?, toolCall? }] }
 * `role` può essere 'tool': il risultato di uno strumento (`name`) chiamato dall'assistente (`toolCall` nel messaggio precedente).
 * `parentId` e `branchedAt` descrivono un ramo (indice dell'ultimo messaggio copiato dalla conversazione di origine);
 * `contextFrom` elenca altre conversazioni da fornire come contesto precedente.
 * Sono JSON leggibili: servono anche da log e possono essere versionati con il progetto.
 */
function createChatStore({ getProjectPath }) {
  const directory = () => {
    const project = getProjectPath()
    if (!project) throw new Error(t('No project open'))
    return path.join(project, '.ow', 'chat')
  }

  function fileFor(id) {
    if (!ID_PATTERN.test(String(id))) throw new Error(t('Invalid conversation identifier'))
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
      title: text(input.title ?? existing.title, MAX_TITLE_CHARS).trim() || t('New conversation'),
      createdAt: existing.createdAt || input.createdAt || now,
      updatedAt: now,
      parentId: optionalId(input.parentId),
      branchedAt: Number.isInteger(input.branchedAt) ? input.branchedAt : null,
      contextFrom: [...new Set((Array.isArray(input.contextFrom) ? input.contextFrom : []).map(optionalId).filter(Boolean))].filter((id) => id !== input.id),
      messages: (Array.isArray(input.messages) ? input.messages : [])
        .filter((message) => message && ['user', 'assistant', 'tool'].includes(message.role))
        .map((message) => ({
          role: message.role,
          content: text(message.content, MAX_MESSAGE_CHARS),
          at: typeof message.at === 'string' ? message.at : now,
          ...(message.error ? { error: true } : {}),
          // Ragionamento mostrato dal modello e chiamate agli strumenti restano nel log della conversazione.
          // Contesto allegato dall'app (es. una nota): etichetta mostrata all'utente, dettaglio inviato al modello, id della nota per il collegamento.
          ...(message.role === 'user' && message.attachment && typeof message.attachment === 'object'
            ? { attachment: { label: text(message.attachment.label, 300), detail: text(message.attachment.detail, MAX_MESSAGE_CHARS), ...(message.attachment.noteId ? { noteId: text(message.attachment.noteId, 80) } : {}) } }
            : {}),
          ...(message.thinking ? { thinking: text(message.thinking, MAX_MESSAGE_CHARS) } : {}),
          ...(message.role === 'tool' ? { name: text(message.name, 60) } : {}),
          // Le immagini restano su disco (.ow/chat/attachments): nel JSON ci sono solo riferimenti.
          ...(Array.isArray(message.images) && message.images.some((image) => ID_PATTERN.test(String(image?.id || '')))
            ? { images: message.images.filter((image) => ID_PATTERN.test(String(image?.id || ''))).map((image) => ({ id: image.id, mime: image.mime === 'image/jpeg' ? 'image/jpeg' : 'image/png', label: text(image.label, 120) })) }
            : {}),
          ...(message.toolCall && typeof message.toolCall === 'object' ? { toolCall: { name: text(message.toolCall.name, 60), arguments: message.toolCall.arguments ?? {} } } : {}),
        })),
    }
  }

  function readConversation(id) {
    const file = fileFor(id)
    if (!fs.existsSync(file)) throw new Error(t('Conversation not found'))
    try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { throw new Error(t('{id}.json is not valid JSON', { id })) }
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

  const attachmentsDirectory = () => path.join(directory(), 'attachments')
  const attachmentExtension = (mime) => (mime === 'image/jpeg' ? 'jpg' : 'png')

  function saveAttachment({ mime, data }) {
    const id = crypto.randomUUID()
    const buffer = Buffer.from(String(data || ''), 'base64')
    if (!buffer.length) throw new Error(t('Empty attachment'))
    fs.mkdirSync(attachmentsDirectory(), { recursive: true })
    fs.writeFileSync(path.join(attachmentsDirectory(), `${id}.${attachmentExtension(mime)}`), buffer)
    return { id, mime: mime === 'image/jpeg' ? 'image/jpeg' : 'image/png' }
  }

  function getAttachment(id) {
    if (!ID_PATTERN.test(String(id))) throw new Error(t('Invalid attachment identifier'))
    for (const [extension, mime] of [['png', 'image/png'], ['jpg', 'image/jpeg']]) {
      const file = path.join(attachmentsDirectory(), `${id}.${extension}`)
      if (fs.existsSync(file)) return { mime, data: fs.readFileSync(file).toString('base64') }
    }
    throw new Error(t('Attachment not found'))
  }

  const attachmentIds = (conversation) => (conversation.messages || []).flatMap((message) => (message.images || []).map((image) => image.id))

  // Elimina la conversazione e gli allegati che nessun'altra conversazione (ad esempio un ramo) usa ancora.
  function remove(id) {
    let own = []
    try { own = attachmentIds(readConversation(id)) } catch {}
    fs.rmSync(fileFor(id), { force: true })
    if (own.length) {
      const stillUsed = new Set()
      for (const name of fs.existsSync(directory()) ? fs.readdirSync(directory()) : []) {
        if (!name.endsWith('.json')) continue
        try { for (const used of attachmentIds(JSON.parse(fs.readFileSync(path.join(directory(), name), 'utf8')))) stillUsed.add(used) } catch {}
      }
      for (const attachment of own.filter((item) => !stillUsed.has(item))) {
        for (const extension of ['png', 'jpg']) fs.rmSync(path.join(attachmentsDirectory(), `${attachment}.${extension}`), { force: true })
      }
    }
    return true
  }

  function ensureDirectory() {
    fs.mkdirSync(directory(), { recursive: true })
    return directory()
  }

  return { list, get: readConversation, create, save, remove, ensureDirectory, saveAttachment, getAttachment }
}

module.exports = { createChatStore }
