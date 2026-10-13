import { useEffect, useRef, useState } from 'react'
import { useEditorState } from '@tiptap/react'
import { Bot, Check, MessageSquarePlus, Search, SearchCheck, Pencil, Trash2, User, X } from 'lucide-react'
import { markdownToPlain, replaceRangeWithMarkdown } from '../lib/editorInsert.js'
import { anchorContext, buildTextIndex, foldText, locateNote, locateQuote, noteIsShown } from '../lib/anchoring.js'
import { formatDateTime } from '../i18n/index.js'
import { t } from '../i18n/index.js'

const electronAPI = window.electronAPI
const statusLabel = (status) => ({ open: t('Open|note'), accepted: t('Accepted'), rejected: t('Rejected'), resolved: t('Resolved') })[status]

export default function NotesPanel({ tab, editor, project, notes, activeNoteId, noteView, onNoteViewChange, search, onSearchChange, onSelectNote, onChanged, onStatus, onAskAi }) {
  const listRef = useRef(null)
  const [draft, setDraft] = useState({ body: '' })
  const [error, setError] = useState('')
  // Correzione in modifica: { id, text }. Per un suggerimento parte dalla proposta, per un commento dal testo citato.
  const [editing, setEditing] = useState(null)

  // Quali note hanno ancora il loro testo nel documento (si aggiorna a ogni modifica).
  const located = useEditorState({
    editor,
    selector: ({ editor: current }) => JSON.stringify(notes.map((note) => Boolean(locateQuote(current.state.doc, note)))),
  })
  const found = JSON.parse(located)

  // Selezionando una nota (dall'elenco o cliccandola nel testo) l'elenco scorre fino alla sua scheda.
  useEffect(() => {
    if (!activeNoteId) return
    const card = [...(listRef.current?.querySelectorAll('[data-note-card]') || [])].find((item) => item.getAttribute('data-note-card') === activeNoteId)
    card?.scrollIntoView({ block: 'nearest' })
  }, [activeNoteId, noteView, notes.length])

  if (!project) return <p className="px-3 py-3 text-xs text-slate-500">{t('Open a project to use notes.')}</p>
  if (!tab.filePath) return <p className="px-3 py-3 text-xs text-slate-500">{t('Save the document as Markdown inside the project to add notes.')}</p>

  const needle = foldText(search.trim())
  const visible = notes.filter((note) => noteIsShown(note, noteView, activeNoteId, needle))


  async function run(action) {
    try {
      setError('')
      await action()
      onChanged()
    } catch (reason) {
      setError(reason.message)
    }
  }

  // Per un commento la correzione la scrive l'assistente, seguendo il suggerimento della nota, e la applica al documento.
  function askAi(note) {
    onAskAi(t('Apply the correction suggested by this note'), {
      noteId: note.id,
      label: `${note.kind === 'suggestion' ? t('Suggestion') : t('Comment')} · “${note.quote.slice(0, 70)}${note.quote.length > 70 ? '…' : ''}”`,
      detail: [
        `Note ${note.id} on the document "${tab.title}" (${note.kind}, by ${note.author}).`,
        `Note text: ${note.body}`,
        `Quoted passage (copy it exactly): ${note.quote}`,
        'Rewrite the passage following the note and apply it directly with replace_text, replacing the whole quoted passage with the complete corrected text.',
        note.author === 'ai' ? `Then mark the note as resolved with update_note (id ${note.id}).` : '',
        'Do not ask for confirmation and keep your final reply to one short sentence.',
      ].filter(Boolean).join('\n'),
    })
  }

  // Nota il cui testo non c'è più: l'assistente verifica se serve ancora; se no la archivia, altrimenti la riallinea al testo attuale.
  function verifyWithAi(note) {
    onAskAi(t('Verify whether this note still applies'), {
      noteId: note.id,
      label: `${note.kind === 'suggestion' ? t('Suggestion') : t('Comment')} · “${note.quote.slice(0, 70)}${note.quote.length > 70 ? '…' : ''}”`,
      detail: [
        `Note ${note.id} on the document "${tab.title}" (${note.kind}, by ${note.author}). Its quoted text can no longer be found in the document, which was probably edited since.`,
        `Note text: ${note.body}`,
        `Original quoted passage: ${note.quote}`,
        note.kind === 'suggestion' ? `Proposed replacement: ${note.replacement ?? ''}` : '',
        `Read the current text of the document (read_file "${tab.title}" if needed) and check whether the remark or suggestion of the note still applies to what is written now.`,
        `If it no longer applies (already fixed, or the passage is gone), archive the note with update_note (id ${note.id}, status "resolved").`,
        `Otherwise align it: call update_note (id ${note.id}) with "quote" set to the exact current passage it refers to and, for a suggestion, "replacement" set to the complete updated corrected passage (also "body" if you are the author and it needs rewording).`,
        'Do not ask for confirmation and keep your final reply to one short sentence saying what you did.',
      ].filter(Boolean).join('\n'),
    })
  }

  const setStatus = (note, status) => run(async () => {
    await electronAPI.updateNote({ filePath: tab.filePath, id: note.id, changes: { status } })
    // Una nota chiusa non resta "selezionata": la selezione la terrebbe in elenco e nel testo anche con la vista "Aperte".
    if (status !== 'open' && note.id === activeNoteId) onSelectNote(null)
  })

  function focusNote(note) {
    onSelectNote(note.id)
    const location = locateNote(editor.state.doc, note)
    if (location) editor.chain().focus().setTextSelection({ from: location.from, to: location.to }).scrollIntoView().run()
  }

  // Applica al documento il testo `text` al posto della citazione (annullabile con Ctrl+Z) e registra la nota come accettata.
  // Se era un commento diventa un suggerimento accettato, così resta traccia di cosa è stato scritto.
  const applyCorrection = (note, text) => run(async () => {
    const location = locateQuote(editor.state.doc, note)
    if (!location) throw new Error(t('The note\'s text is no longer in the document'))
    if (text === note.quote) throw new Error(t('The text is identical to the current one: there is nothing to correct'))
    replaceRangeWithMarkdown(editor, location.from, location.to, text)
    editor.commands.focus()
    await electronAPI.updateNote({ filePath: tab.filePath, id: note.id, changes: { kind: 'suggestion', replacement: text, status: 'accepted' } })
    setEditing(null)
    onStatus(t('Correction applied (not saved yet)'))
  })

  // Nota scritta a mano: solo la nota, ancorata al testo selezionato (per far lavorare l'assistente sul testo si usa la chat, che ha già la selezione).
  const addNote = () => run(async () => {
    const { from, to, empty } = editor.state.selection
    if (empty) throw new Error(t('Select in the document the text to attach the note to'))
    if (!draft.body.trim()) throw new Error(t('Write the note\'s text'))
    const index = buildTextIndex(editor.state.doc)
    // Il doppio clic seleziona anche lo spazio finale: si ancora solo al testo, altrimenti una correzione lo cancellerebbe.
    const quote = editor.state.doc.textBetween(from, to, '\n').trim()
    if (!quote) throw new Error(t('Select in the document the text to attach the note to'))
    const offset = index.text.indexOf(quote)
    const context = offset === -1 ? { prefix: '', suffix: '' } : anchorContext(index, { index: offset, length: quote.length })
    await electronAPI.addNote({
      filePath: tab.filePath,
      note: { kind: 'comment', quote, ...context, body: draft.body, replacement: null, author: 'user' },
    })
    setDraft({ body: '' })
  })

  const fieldClass = 'w-full rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-accent-400'
  const smallButton = 'flex items-center gap-1 rounded px-2 py-1 text-xs transition'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-2 border-b border-slate-800 p-3">
        <textarea rows={3} value={draft.body} placeholder={t('Note on the selected text…')} className={`${fieldClass} resize-none`} onChange={(event) => setDraft({ body: event.target.value })} />
        <button type="button" className="flex items-center justify-center gap-1.5 rounded-md bg-accent-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-accent-500" onClick={addNote}><MessageSquarePlus size={15} /> {t('Add to selection')}</button>
      </div>

      <div className="flex gap-1 border-b border-slate-800 px-3 py-2 text-xs">
        {[['open', t('Open|notes')], ['all', t('All|notes')], ['mine', t('Mine|notes')], ['none', t('Hide|notes')]].map(([value, label]) => (
          <button key={value} type="button" className={`rounded-full px-2.5 py-1 transition ${noteView === value ? 'bg-accent-500/20 text-accent-400' : 'text-slate-500 hover:text-slate-200'}`} title={t('Which notes to show in the list and in the text (the selected note is always shown)')} onClick={() => onNoteViewChange(value)}>{label}</button>
        ))}
        <span className="ml-auto self-center text-slate-500">{t('{length} open', { length: notes.filter((note) => note.status === 'open').length })}</span>
      </div>

      <div className="relative border-b border-slate-800 px-3 py-2">
        <Search size={13} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={search}
          placeholder={t('Search notes…')}
          aria-label={t('Search notes…')}
          className="w-full rounded-md border border-slate-700 bg-slate-800 py-1.5 pl-7 pr-7 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-accent-400"
          onChange={(event) => onSearchChange(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Escape') onSearchChange('') }}
        />
        {search && <button type="button" aria-label={t('Clear search')} title={t('Clear search')} className="absolute right-5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-500 hover:text-slate-50" onClick={() => onSearchChange('')}><X size={12} /></button>}
      </div>

      {error && <p className="px-3 py-2 text-xs text-rose-400">{error}</p>}
      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {!visible.length && <p className="px-4 py-6 text-center text-xs text-slate-500">{needle ? t('No notes match the search.') : noteView === 'none' ? t('Notes are hidden. Pick “Open”, “All” or “Mine” to show them.') : noteView === 'mine' ? t('You have not written any notes yet.') : noteView === 'open' ? t('No open notes. The assistant can add some during a review.') : t('No notes.')}</p>}
        {visible.map((note) => {
          const index = notes.indexOf(note)
          const orphan = note.status === 'open' && !found[index]
          return (
            <div key={note.id} data-note-card={note.id} className={`border-b border-slate-800/60 px-3 py-2.5 ${note.id === activeNoteId ? 'bg-slate-800/60' : ''}`}>
              <button type="button" className="block w-full text-left" onClick={() => focusNote(note)}>
                <span className="flex items-center gap-1.5 text-xs text-slate-500">
                  {note.author === 'ai' ? <Bot size={12} /> : <User size={12} />}
                  {note.kind === 'suggestion' ? t('Suggestion') : t('Comment')} · {statusLabel(note.status)}
                  {note.updatedAt && <span className="text-slate-500" title={t('Revised on {formatDateTime}', { formatDateTime: formatDateTime(note.updatedAt, { dateStyle: 'medium', timeStyle: 'short' }) })}>{t('· revised')}</span>}
                  {orphan && <span className="text-slate-400" title={t('The passage has changed since the note was written, so it cannot be located any more. Verify whether the note still applies, or resolve it.')}>{t('· text modified')}</span>}
                </span>
                <span className="mt-1 block truncate border-l-2 border-slate-600 pl-2 text-xs italic text-slate-400">{note.quote}</span>
                <span className="mt-1 block whitespace-pre-wrap text-sm text-slate-200">{note.body}</span>
                {note.kind === 'suggestion' && (
                  <span className="mt-1 block rounded bg-slate-950/50 px-2 py-1 text-xs">
                    <span className="text-rose-300 line-through">{note.quote}</span>
                    <span className="mx-1 text-slate-500">→</span>
                    <span className="text-emerald-300">{markdownToPlain(note.replacement) || t('(delete)')}</span>
                  </span>
                )}
              </button>
              {editing?.id === note.id && (
                <div className="mt-2 grid gap-1.5">
                  <label className="text-xs text-slate-400" htmlFor={`correction-${note.id}`}>{t('Text to write in place of the quote')}</label>
                  <textarea
                    id={`correction-${note.id}`}
                    autoFocus
                    rows={3}
                    value={editing.text}
                    className={`${fieldClass} resize-y`}
                    onChange={(event) => setEditing({ id: note.id, text: event.target.value })}
                    onKeyDown={(event) => { if (event.key === 'Escape') setEditing(null) }}
                  />
                  <div className="flex gap-1">
                    <button type="button" className={`${smallButton} bg-accent-600 text-white hover:bg-accent-500`} onClick={() => applyCorrection(note, editing.text)}><Check size={12} /> {t('Apply to the document')}</button>
                    <button type="button" className={`${smallButton} text-slate-400 hover:bg-slate-800 hover:text-slate-50`} onClick={() => setEditing(null)}>{t('Cancel')}</button>
                  </div>
                </div>
              )}
              <div className="mt-1.5 flex flex-wrap gap-1">
                {note.status === 'open' && note.kind === 'suggestion' && (
                  <>
                    {!orphan && <button type="button" className={`${smallButton} bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25`} onClick={() => applyCorrection(note, note.replacement ?? '')}><Check size={12} /> {t('Accept')}</button>}
                    {!orphan && <button type="button" className={`${smallButton} bg-slate-700 text-slate-100 hover:bg-slate-600`} onClick={() => setEditing({ id: note.id, text: note.replacement ?? '' })}><Pencil size={12} /> {t('Edit…')}</button>}
                    <button type="button" className={`${smallButton} bg-rose-500/15 text-rose-300 hover:bg-rose-500/25`} onClick={() => setStatus(note, 'rejected')}><X size={12} /> {t('Reject')}</button>
                    <button type="button" className={`${smallButton} bg-slate-700 text-slate-100 hover:bg-slate-600`} title={t('Closes the note without changing the document')} onClick={() => setStatus(note, 'resolved')}><Check size={12} /> {t('Resolve')}</button>
                  </>
                )}
                {note.status === 'open' && note.kind === 'comment' && (
                  <>
                    {!orphan && <button type="button" className={`${smallButton} bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25`} onClick={() => askAi(note)}><Pencil size={12} /> {t('Apply correction…')}</button>}
                    <button type="button" className={`${smallButton} bg-slate-700 text-slate-100 hover:bg-slate-600`} title={t('Closes the note without changing the document')} onClick={() => setStatus(note, 'resolved')}><Check size={12} /> {t('Resolve without changing')}</button>
                  </>
                )}
                {note.status === 'open' && orphan && (
                  <>
                    <button type="button" className={`${smallButton} bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25`} title={t('Ask the assistant to check whether the note still applies: if not it is archived, otherwise it is aligned to the current text')} onClick={() => verifyWithAi(note)}><SearchCheck size={12} /> {t('Verify')}</button>
                    <button type="button" className={`${smallButton} bg-slate-700 text-slate-100 hover:bg-slate-600`} title={t('Archives the note without changing the document')} onClick={() => setStatus(note, 'resolved')}><Check size={12} /> {t('Resolve')}</button>
                  </>
                )}
                {note.status !== 'open' && (
                  <button type="button" className={`${smallButton} text-slate-400 hover:bg-slate-800 hover:text-slate-50`} onClick={() => setStatus(note, 'open')}>{t('Reopen')}</button>
                )}
                <button type="button" aria-label={t('Delete note')} title={t('Delete')} className={`${smallButton} ml-auto text-slate-500 hover:bg-slate-800 hover:text-rose-400`} onClick={() => run(() => electronAPI.deleteNote({ filePath: tab.filePath, id: note.id }))}><Trash2 size={12} /></button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
