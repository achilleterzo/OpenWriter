import { useEffect, useRef, useState } from 'react'
import { Check, Copy, CornerDownLeft, FolderOpen, GitBranch, Pencil, Plus, Send, Settings, Sparkles, Trash2, X } from 'lucide-react'

const api = window.electronAPI
const ai = api?.ai
const MAX_CONTEXT_CHARS = 60000
const MAX_PREVIOUS_CHARS = 12000

const quickActions = [
  { label: 'Correggi', prompt: 'Correggi ortografia, grammatica e punteggiatura senza cambiare il significato. Restituisci solo il testo corretto.' },
  { label: 'Riscrivi', prompt: 'Riscrivi il testo in modo più chiaro e scorrevole mantenendo il significato e il tono.' },
  { label: 'Riassumi', prompt: 'Riassumi il testo in pochi punti essenziali.' },
  { label: 'Revisiona', prompt: 'Revisiona il testo: elenca i problemi di stile, chiarezza e coerenza e proponi miglioramenti concreti.' },
]

const blankConversation = () => ({ id: null, title: '', parentId: null, branchedAt: null, contextFrom: [], messages: [] })
const dateFormatter = new Intl.DateTimeFormat('it', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

const systemPrompt = (language, projectContext = '', previousChats = []) => [
  'Sei l\'assistente di scrittura integrato in OpenWriter, un editor di documenti Markdown.',
  `Rispondi in ${language}, salvo diversa richiesta. Sii conciso.`,
  'Quando riscrivi o correggi un testo, restituisci direttamente il testo in Markdown, senza preamboli.',
  projectContext.trim() && `Contesto del progetto fornito dall'autore (rispettalo):\n---\n${projectContext.trim()}\n---`,
  ...previousChats.map(({ title, transcript }) => `Conversazione precedente "${title}", da usare solo come contesto:\n---\n${transcript}\n---`),
].filter(Boolean).join('\n\n')

// Trascrizione di una conversazione per usarla come contesto: se è lunga si tengono i messaggi più recenti.
function transcriptOf(conversation) {
  const text = conversation.messages
    .filter((message) => !message.error)
    .map((message) => `${message.role === 'user' ? 'Utente' : 'Assistente'}: ${message.content}`)
    .join('\n\n')
  return text.length > MAX_PREVIOUS_CHARS ? `…${text.slice(-MAX_PREVIOUS_CHARS)}` : text
}

function selectedText(editor) {
  const { from, to, empty } = editor.state.selection
  return empty ? '' : editor.state.doc.textBetween(from, to, '\n\n')
}

function Message({ message, editor, onBranch }) {
  const [copied, setCopied] = useState(false)
  const assistant = message.role === 'assistant'

  async function copy() {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const actionClass = 'flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-slate-800 hover:text-slate-200'

  return (
    <div className={`group flex flex-col gap-1 ${assistant ? 'items-start' : 'items-end'}`}>
      <div className={`max-w-[92%] whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm leading-6 ${message.error ? 'border border-rose-500/40 bg-rose-500/10 text-rose-300' : assistant ? 'bg-slate-800 text-slate-200' : 'bg-accent-600 text-white'}`}>
        {message.content}
      </div>
      <div className="flex gap-1 text-xs text-slate-500 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
        {assistant && !message.error && (
          <>
            <button type="button" className={actionClass} onClick={copy}>{copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copiato' : 'Copia'}</button>
            {editor && (
              <button type="button" title="Sostituisce la selezione o inserisce al cursore" className={actionClass} onClick={() => editor.chain().focus().insertContent(message.content, { contentType: 'markdown' }).run()}>
                <CornerDownLeft size={12} /> Inserisci
              </button>
            )}
          </>
        )}
        {onBranch && <button type="button" title="Crea una nuova conversazione a partire da questo messaggio" className={actionClass} onClick={onBranch}><GitBranch size={12} /> Dirama da qui</button>}
      </div>
    </div>
  )
}

export default function AiChatPanel({ editor, project, settingsVersion, conversationId, onConversationChange, onOpenSettings }) {
  const [settings, setSettings] = useState(null)
  const [projectSettings, setProjectSettings] = useState(null)
  const [conversations, setConversations] = useState([])
  const [current, setCurrent] = useState(blankConversation)
  const [renaming, setRenaming] = useState(false)
  const [input, setInput] = useState('')
  const [includeDocument, setIncludeDocument] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const endRef = useRef(null)

  useEffect(() => {
    ai?.getSettings().then(setSettings)
  }, [settingsVersion])

  // Il contesto di progetto (.ow/context.md) si rilegge a ogni cambio di progetto o chiusura delle impostazioni.
  useEffect(() => {
    if (!project) { setProjectSettings(null); return }
    api.getProjectSettings().then(setProjectSettings).catch(() => setProjectSettings(null))
  }, [project, settingsVersion])

  // Carica le conversazioni del progetto e riapre l'ultima in uso. Senza progetto la chat resta solo in memoria.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!project) { setConversations([]); setCurrent(blankConversation()); return }
      try {
        const list = await api.listConversations()
        if (cancelled) return
        setConversations(list)
        const id = list.some((item) => item.id === conversationId) ? conversationId : null
        setCurrent(id ? await api.getConversation(id) : blankConversation())
      } catch (reason) {
        if (!cancelled) setError(reason.message)
      }
    })()
    return () => { cancelled = true }
    // L'avvio dipende solo dal progetto: l'id attivo viene poi gestito da questo componente.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project])

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [current.messages, busy])

  const provider = settings?.provider
  const model = settings?.providers?.[provider]?.model
  const providerLabel = { ollama: 'Ollama', 'ollama-cloud': 'Ollama Cloud', codex: 'Codex', claude: 'Claude' }[provider]
  const enabled = Boolean(settings?.aiEnabled)
  const canBranch = Boolean(project && current.id && !busy)
  const parent = current.parentId ? conversations.find((item) => item.id === current.parentId) : null

  const refreshList = async () => { if (project) setConversations(await api.listConversations()) }

  // Salva (o crea) la conversazione su disco; un errore di scrittura non interrompe il dialogo.
  async function persist(conversation) {
    if (!project) return conversation
    try {
      const saved = conversation.id ? await api.saveConversation(conversation) : await api.createConversation(conversation)
      onConversationChange(saved.id)
      refreshList()
      return saved
    } catch (reason) {
      setError(`Conversazione non salvata: ${reason.message}`)
      return conversation
    }
  }

  async function openConversation(id) {
    if (busy) return
    setError('')
    if (!id) { setCurrent(blankConversation()); onConversationChange(null); return }
    try {
      setCurrent(await api.getConversation(id))
      onConversationChange(id)
    } catch (reason) {
      setError(reason.message)
    }
  }

  async function removeConversation() {
    if (!current.id || busy || !window.confirm(`Eliminare la conversazione "${current.title}"? Il file in .ow/chat verrà cancellato.`)) return
    try {
      await api.deleteConversation(current.id)
      const list = await api.listConversations()
      setConversations(list)
      await openConversation(list[0]?.id ?? null)
    } catch (reason) {
      setError(reason.message)
    }
  }

  async function updateConversation(changes) {
    const next = { ...current, ...changes }
    setCurrent(next)
    if (next.id) setCurrent(await persist(next))
  }

  async function branchFrom(index) {
    const branch = {
      ...blankConversation(),
      title: `${current.title || 'Conversazione'} (ramo)`,
      parentId: current.id,
      branchedAt: index,
      contextFrom: current.contextFrom,
      messages: current.messages.slice(0, index + 1),
    }
    setCurrent(await persist(branch))
  }

  async function send(text) {
    const content = text.trim()
    if (!content || busy || !enabled) return
    setError('')
    setBusy(true)
    setInput('')

    // Il messaggio dell'utente viene salvato subito: anche se la richiesta fallisce resta nel log.
    let conversation = {
      ...current,
      title: current.title || content.slice(0, 60),
      messages: [...current.messages, { role: 'user', content, at: new Date().toISOString() }],
    }
    setCurrent(conversation)
    conversation = await persist(conversation)
    setCurrent(conversation)

    try {
      // Selezione e documento viaggiano solo con l'ultima richiesta, senza gonfiare la cronologia salvata.
      const selection = editor ? selectedText(editor) : ''
      const document = editor && includeDocument ? editor.getMarkdown().slice(0, MAX_CONTEXT_CHARS) : ''
      const context = [
        document && `Documento aperto (Markdown):\n"""\n${document}\n"""`,
        selection && `Testo selezionato dall'utente:\n"""\n${selection}\n"""`,
      ].filter(Boolean).join('\n\n')
      const history = conversation.messages.filter((message) => !message.error)
      const payload = history.map((message, index) => (
        index === history.length - 1 && context ? { role: 'user', content: `${context}\n\nRichiesta: ${message.content}` } : { role: message.role, content: message.content }
      ))
      const previous = (await Promise.all((conversation.contextFrom || []).map((id) => api.getConversation(id).catch(() => null))))
        .filter(Boolean)
        .map((item) => ({ title: item.title, transcript: transcriptOf(item) }))

      const reply = await ai.chat([
        { role: 'system', content: systemPrompt(projectSettings?.ai?.language || settings.language || 'Italiano', projectSettings?.ai?.context, previous) },
        ...payload,
      ])
      conversation = { ...conversation, messages: [...conversation.messages, { role: 'assistant', content: reply || '(risposta vuota)', at: new Date().toISOString() }] }
    } catch (reason) {
      conversation = { ...conversation, messages: [...conversation.messages, { role: 'assistant', content: reason.message, at: new Date().toISOString(), error: true }] }
    }
    setCurrent(await persist(conversation))
    setBusy(false)
  }

  const attachable = conversations.filter((item) => item.id !== current.id && !current.contextFrom.includes(item.id))
  const titleOf = (id) => conversations.find((item) => item.id === id)?.title || 'Conversazione eliminata'
  const iconButton = 'rounded p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-50 disabled:opacity-40'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="grid gap-2 border-b border-slate-800 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400"><Sparkles size={13} className="text-accent-400" /> Assistente AI</h2>
            {enabled && <p className="truncate text-xs text-slate-500">{providerLabel}{model ? ` · ${model}` : ''}{projectSettings?.ai?.context?.trim() ? ' · contesto di progetto' : ''}</p>}
          </div>
          <div className="flex shrink-0 gap-0.5">
            <button type="button" aria-label="Nuova conversazione" title="Nuova conversazione" disabled={busy || !current.messages.length} className={iconButton} onClick={() => openConversation(null)}><Plus size={14} /></button>
            <button type="button" aria-label="Impostazioni AI" title="Impostazioni AI" className={iconButton} onClick={onOpenSettings}><Settings size={14} /></button>
          </div>
        </div>

        {project && (
          <div className="flex items-center gap-1">
            {renaming ? (
              <input
                autoFocus
                defaultValue={current.title}
                aria-label="Titolo della conversazione"
                className="min-w-0 flex-1 rounded border border-accent-400 bg-slate-800 px-2 py-1 text-sm text-slate-50 outline-none"
                onBlur={(event) => { setRenaming(false); const title = event.target.value.trim(); if (title && title !== current.title) updateConversation({ title }) }}
                onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') setRenaming(false) }}
              />
            ) : (
              <select
                aria-label="Conversazione"
                value={current.id || ''}
                disabled={busy}
                className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100 outline-none focus:border-accent-400"
                onChange={(event) => openConversation(event.target.value || null)}
              >
                {!current.id && <option value="">Nuova conversazione</option>}
                {conversations.map((item) => <option key={item.id} value={item.id}>{item.parentId ? '↳ ' : ''}{item.title} · {dateFormatter.format(new Date(item.updatedAt))}</option>)}
              </select>
            )}
            <button type="button" aria-label="Rinomina conversazione" title="Rinomina" disabled={!current.id || busy || renaming} className={iconButton} onClick={() => setRenaming(true)}><Pencil size={14} /></button>
            <button type="button" aria-label="Elimina conversazione" title="Elimina" disabled={!current.id || busy} className={`${iconButton} hover:text-rose-400`} onClick={removeConversation}><Trash2 size={14} /></button>
            <button type="button" aria-label="Apri la cartella delle conversazioni" title="Apri .ow/chat nel file manager" className={iconButton} onClick={() => api.openChatFolder()}><FolderOpen size={14} /></button>
          </div>
        )}
        {current.parentId && (
          <p className="flex items-center gap-1 text-xs text-slate-500"><GitBranch size={12} /> Ramo di «{parent?.title || 'conversazione eliminata'}», dal messaggio {current.branchedAt + 1}</p>
        )}
      </header>

      {!ai || !settings ? null : !enabled ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <Sparkles size={30} className="text-slate-600" />
          <p className="text-sm text-slate-400">L&apos;assistente AI è disattivato. Abilitalo e scegli un provider nelle impostazioni.</p>
          <button type="button" className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-500" onClick={onOpenSettings}>Apri impostazioni</button>
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
            {!current.messages.length && (
              <p className="m-auto max-w-[16rem] text-center text-sm text-slate-500">
                Chiedi di correggere, riscrivere o discutere il documento. Se selezioni del testo, l&apos;assistente lavora su quello.
                {!project && ' Senza un progetto aperto la conversazione non viene salvata.'}
              </p>
            )}
            {current.messages.map((message, index) => <Message key={index} message={message} editor={editor} onBranch={canBranch ? () => branchFrom(index) : null} />)}
            {busy && <p className="text-sm text-slate-500">Sto elaborando…</p>}
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <div ref={endRef} />
          </div>

          <div className="border-t border-slate-800 p-3">
            <div className="mb-2 flex flex-wrap gap-1.5">
              {quickActions.map((action) => (
                <button key={action.label} type="button" disabled={busy} className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-300 transition hover:border-accent-400 hover:text-slate-50 disabled:opacity-50" onClick={() => send(action.prompt)}>{action.label}</button>
              ))}
            </div>
            <label className="mb-2 flex items-center gap-2 text-xs text-slate-500">
              <input type="checkbox" checked={includeDocument} onChange={(event) => setIncludeDocument(event.target.checked)} className="accent-accent-500" />
              Includi il documento attivo come contesto
            </label>
            {project && (current.contextFrom.length > 0 || attachable.length > 0) && (
              <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                {current.contextFrom.map((id) => (
                  <span key={id} className="flex items-center gap-1 rounded-full border border-slate-700 bg-slate-800 py-0.5 pl-2 pr-1 text-slate-300">
                    {titleOf(id)}
                    <button type="button" aria-label="Rimuovi dal contesto" disabled={busy} className="rounded-full p-0.5 hover:bg-slate-700" onClick={() => updateConversation({ contextFrom: current.contextFrom.filter((item) => item !== id) })}><X size={11} /></button>
                  </span>
                ))}
                {attachable.length > 0 && (
                  <select
                    aria-label="Usa una conversazione precedente come contesto"
                    value=""
                    disabled={busy}
                    className="max-w-[11rem] rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-xs text-slate-300 outline-none focus:border-accent-400"
                    onChange={(event) => event.target.value && updateConversation({ contextFrom: [...current.contextFrom, event.target.value] })}
                  >
                    <option value="">+ Contesto da conversazione…</option>
                    {attachable.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                  </select>
                )}
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                rows={3}
                placeholder="Scrivi un messaggio…  (Invio per inviare, Maiusc+Invio per andare a capo)"
                className="min-h-0 flex-1 resize-none rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-accent-400"
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    send(input)
                  }
                }}
              />
              <button type="button" aria-label="Invia" title="Invia" disabled={busy || !input.trim()} className="rounded-md bg-accent-600 p-2.5 text-white transition hover:bg-accent-500 disabled:opacity-50" onClick={() => send(input)}><Send size={16} /></button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
