import { useEffect, useRef, useState } from 'react'
import { useEditorState } from '@tiptap/react'
import { Bookmark, BookmarkPlus, Bot, Check, Copy, Flag, Link as LinkIcon, Pencil, Trash2, X } from 'lucide-react'
import { anchorContext, buildTextIndex, locateQuote } from '../lib/anchoring.js'
import { relativeLink } from '../lib/bookmarkLinks.js'
import { t } from '../i18n/index.js'

const electronAPI = window.electronAPI
const snippet = (text, length = 90) => (text.length > length ? `${text.slice(0, length)}…` : text)

function Card({ bookmark, active, missing, onGo, children }) {
  return (
    <div data-bookmark-card={bookmark.id} className={`rounded-lg border p-2.5 text-sm transition ${active ? 'border-accent-400 bg-slate-800' : 'border-slate-800 bg-slate-900/60'} ${missing ? 'opacity-60' : ''}`}>
      <button type="button" className="flex w-full items-start gap-2 text-left" onClick={onGo}>
        <Bookmark size={15} className={`mt-0.5 shrink-0 ${bookmark.flagged ? 'text-amber-400' : 'text-accent-400'}`} fill={bookmark.flagged ? 'currentColor' : 'none'} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-slate-100">{bookmark.label || `#${bookmark.name}`}</span>
          <code className="block truncate text-[11px] text-slate-500">#{bookmark.name}</code>
          <span className="mt-0.5 block text-xs italic text-slate-400">“{snippet(bookmark.quote)}”</span>
          {bookmark.note && <span className="mt-1 block whitespace-pre-wrap text-xs text-slate-300">{bookmark.note}</span>}
          {missing && <span className="mt-1 block text-xs text-amber-400">{t('The anchored text is no longer in the document')}</span>}
        </span>
      </button>
      {children}
    </div>
  )
}

const iconButton = 'rounded p-1.5 text-slate-500 transition hover:bg-slate-700 hover:text-slate-50'

export default function BookmarksPanel({ tab, editor, project, bookmarks, activeId, onSelect, onChanged, onStatus, onAskAi, onOpenBookmark }) {
  const [scope, setScope] = useState('document')
  const [draft, setDraft] = useState({ label: '', note: '', flagged: false })
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [everything, setEverything] = useState([])

  // Dove sta ogni segnalibro nel documento (posizione di inizio, o null se il testo non c'è più): si aggiorna a ogni modifica.
  const cache = useRef({ doc: null, bookmarks: null, value: '[]' })
  const located = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const { doc } = current.state
      if (cache.current.doc === doc && cache.current.bookmarks === bookmarks) return cache.current.value
      const index = buildTextIndex(doc)
      const value = JSON.stringify(bookmarks.map((item) => locateQuote(doc, item, index)?.from ?? null))
      cache.current = { doc, bookmarks, value }
      return value
    },
  })
  const positions = JSON.parse(located)

  useEffect(() => {
    if (scope !== 'project' || !project) return undefined
    let cancelled = false
    electronAPI.listAllBookmarks().then((list) => { if (!cancelled) setEverything(list) }).catch(() => { if (!cancelled) setEverything([]) })
    return () => { cancelled = true }
  }, [scope, project, bookmarks])

  if (!project) return <p className="px-3 py-3 text-xs text-slate-500">{t('Open a project to use bookmarks.')}</p>
  if (!tab.filePath) return <p className="px-3 py-3 text-xs text-slate-500">{t('Save the document as Markdown inside the project to add bookmarks.')}</p>

  async function run(action) {
    try {
      setError('')
      await action()
      onChanged()
    } catch (reason) {
      setError(reason.message)
    }
  }

  // Il segnalibro si àncora al testo selezionato; senza selezione, all'inizio del paragrafo in cui sta il cursore.
  const add = () => run(async () => {
    const { from, to, empty, $from } = editor.state.selection
    let quote = empty ? '' : editor.state.doc.textBetween(from, to, '\n').trim()
    // Il cursore deve stare dentro un blocco di testo: altrimenti il "genitore" sarebbe l'intero documento.
    if (!quote && $from.parent.isTextblock) quote = $from.parent.textContent.trim().slice(0, 120)
    if (!quote) throw new Error(t('Select some text, or put the cursor in a paragraph with text'))
    quote = quote.slice(0, 200)
    const index = buildTextIndex(editor.state.doc)
    const offset = index.text.indexOf(quote)
    const context = offset === -1 ? { prefix: '', suffix: '' } : anchorContext(index, { index: offset, length: quote.length })
    const created = await electronAPI.addBookmark({ filePath: tab.filePath, bookmark: { quote, ...context, label: draft.label.trim() || snippet(quote, 50), note: draft.note, flagged: draft.flagged, author: 'user' } })
    setDraft({ label: '', note: '', flagged: false })
    onSelect(created.id)
    onStatus(t('Bookmark added: {link}', { link: `${tab.title}#${created.name}` }))
  })

  function go(bookmark) {
    onSelect(bookmark.id)
    const location = locateQuote(editor.state.doc, bookmark)
    if (location) editor.chain().focus().setTextSelection({ from: location.from, to: location.to }).scrollIntoView().run()
  }

  // Link a un segnalibro inserito dove sta il cursore (sul testo selezionato, se c'è).
  function insertLink(href, label) {
    const { empty } = editor.state.selection
    if (empty) editor.chain().focus().insertContent({ type: 'text', text: label, marks: [{ type: 'link', attrs: { href } }] }).run()
    else editor.chain().focus().setLink({ href }).run()
    onStatus(t('Link inserted'))
  }

  const copyLink = async (bookmark) => {
    await navigator.clipboard.writeText(`${tab.title}#${bookmark.name}`)
    onStatus(t('Copied: {name}', { name: `${tab.title}#${bookmark.name}` }))
  }

  const askAi = (bookmark) => onAskAi(
    t('Look at this bookmark'),
    {
      label: `${t('Bookmark')} · ${bookmark.label || `#${bookmark.name}`}`,
      detail: [
        `Bookmark "${bookmark.name}" in the document "${tab.title}"${bookmark.flagged ? ' (flagged by the user for you)' : ''}.`,
        bookmark.label ? `Label: ${bookmark.label}` : '',
        bookmark.note ? `Note from the user: ${bookmark.note}` : '',
        `Anchored passage (copy it exactly if you need to find it): ${bookmark.quote}`,
        `Read the document around that passage (read_file "${tab.title}") and follow the user's request about it; if there is a note, it is the instruction.`,
        'Keep your final reply short.',
      ].filter(Boolean).join('\n'),
    },
  )

  const ordered = bookmarks
    .map((item, index) => ({ item, position: positions[index] }))
    .sort((left, right) => (left.position === null) - (right.position === null) || (left.position ?? 0) - (right.position ?? 0))

  const toggleFlag = (bookmark) => run(() => electronAPI.updateBookmark({ filePath: tab.filePath, id: bookmark.id, changes: { flagged: !bookmark.flagged } }))
  const remove = (bookmark) => run(async () => {
    await electronAPI.deleteBookmark({ filePath: tab.filePath, id: bookmark.id })
    if (activeId === bookmark.id) onSelect(null)
  })
  const saveEdit = () => run(async () => {
    await electronAPI.updateBookmark({ filePath: tab.filePath, id: editing.id, changes: { label: editing.label, name: editing.name, note: editing.note } })
    setEditing(null)
  })

  const field = 'w-full rounded border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-accent-400'

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid gap-2 border-b border-slate-800 p-3">
        <div role="tablist" className="inline-flex w-fit overflow-hidden rounded-md border border-slate-700 text-xs">
          {[['document', t('This document')], ['project', t('Whole project')]].map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={scope === value} className={`px-3 py-1.5 transition ${scope === value ? 'bg-accent-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-slate-50'}`} onClick={() => setScope(value)}>{label}</button>
          ))}
        </div>
        {scope === 'document' && (
          <div className="grid gap-1.5">
            <input value={draft.label} placeholder={t('Name of the bookmark (optional)')} aria-label={t('Name of the bookmark (optional)')} className={field} onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
            <textarea value={draft.note} rows={2} placeholder={t('Note (optional): for you or for the assistant')} aria-label={t('Note (optional): for you or for the assistant')} className={`${field} resize-none`} onChange={(event) => setDraft({ ...draft, note: event.target.value })} />
            <label className="flex items-center gap-1.5 text-xs text-slate-400"><input type="checkbox" className="accent-accent-500" checked={draft.flagged} onChange={(event) => setDraft({ ...draft, flagged: event.target.checked })} /> {t('Point it out to the assistant')}</label>
            <button type="button" className="flex w-fit items-center gap-1.5 rounded-md bg-accent-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-500" onClick={add}><BookmarkPlus size={14} /> {t('Add a bookmark here')}</button>
            <span className="text-[11px] text-slate-500">{t('It marks the selected text, or the start of the paragraph where the cursor is. Link to it with file.md#name.')}</span>
          </div>
        )}
        {error && <p role="alert" className="text-xs text-rose-400">{error}</p>}
      </div>

      <div className="grid min-h-0 flex-1 content-start gap-2 overflow-y-auto p-3">
        {scope === 'document' && !ordered.length && <p className="text-xs text-slate-500">{t('No bookmarks in this document yet.')}</p>}
        {scope === 'document' && ordered.map(({ item: bookmark, position }) => (
          <Card key={bookmark.id} bookmark={bookmark} active={bookmark.id === activeId} missing={position === null} onGo={() => go(bookmark)}>
            {editing?.id === bookmark.id ? (
              <div className="mt-2 grid gap-1.5">
                <input value={editing.label} aria-label={t('Name of the bookmark (optional)')} placeholder={t('Name of the bookmark (optional)')} className={field} onChange={(event) => setEditing({ ...editing, label: event.target.value })} />
                <input value={editing.name} aria-label={t('Name in the link')} placeholder={t('Name in the link')} className={`${field} font-mono`} onChange={(event) => setEditing({ ...editing, name: event.target.value })} />
                <textarea value={editing.note} rows={3} aria-label={t('Note')} placeholder={t('Note')} className={`${field} resize-none`} onChange={(event) => setEditing({ ...editing, note: event.target.value })} />
                <div className="flex gap-1.5">
                  <button type="button" className="flex items-center gap-1 rounded bg-accent-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-500" onClick={saveEdit}><Check size={13} /> {t('Save')}</button>
                  <button type="button" className="flex items-center gap-1 rounded px-2.5 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-50" onClick={() => setEditing(null)}><X size={13} /> {t('Cancel')}</button>
                </div>
              </div>
            ) : (
              <div className="mt-1.5 flex flex-wrap items-center gap-0.5">
                <button type="button" aria-label={t('Copy the link')} title={t('Copy the link (file.md#name)')} className={iconButton} onClick={() => copyLink(bookmark)}><Copy size={14} /></button>
                <button type="button" aria-label={t('Insert a link here')} title={t('Insert a link to this bookmark at the cursor')} className={iconButton} onClick={() => insertLink(`#${bookmark.name}`, bookmark.label || bookmark.name)}><LinkIcon size={14} /></button>
                <button type="button" aria-label={t('Point it out to the assistant')} aria-pressed={bookmark.flagged} title={bookmark.flagged ? t('Flagged for the assistant: click to unflag') : t('Point it out to the assistant')} className={`${iconButton} ${bookmark.flagged ? 'text-amber-400' : ''}`} onClick={() => toggleFlag(bookmark)}><Flag size={14} fill={bookmark.flagged ? 'currentColor' : 'none'} /></button>
                <button type="button" aria-label={t('Ask the assistant')} title={t('Ask the assistant about this point')} className={iconButton} onClick={() => askAi(bookmark)}><Bot size={14} /></button>
                <button type="button" aria-label={t('Edit')} title={t('Edit')} className={iconButton} onClick={() => setEditing({ id: bookmark.id, label: bookmark.label, name: bookmark.name, note: bookmark.note })}><Pencil size={14} /></button>
                <button type="button" aria-label={t('Delete')} title={t('Delete')} className={`${iconButton} hover:text-rose-400`} onClick={() => remove(bookmark)}><Trash2 size={14} /></button>
              </div>
            )}
          </Card>
        ))}

        {scope === 'project' && !everything.length && <p className="text-xs text-slate-500">{t('No bookmarks in the project yet.')}</p>}
        {scope === 'project' && everything.map((group) => {
          const absolute = group.absolute ? group.path : `${project}/${group.path}`
          return (
            <section key={group.path} className="grid gap-1.5">
              <h3 className="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-500" title={absolute}>{group.path}</h3>
              {group.bookmarks.map((bookmark) => (
                <Card key={bookmark.id} bookmark={bookmark} active={false} missing={false} onGo={() => onOpenBookmark(absolute, bookmark.name)}>
                  <div className="mt-1.5 flex items-center gap-0.5">
                    <button type="button" aria-label={t('Insert a link here')} title={t('Insert a link to this bookmark at the cursor')} className={iconButton} onClick={() => insertLink(`${relativeLink(tab.filePath, absolute)}#${bookmark.name}`, bookmark.label || bookmark.name)}><LinkIcon size={14} /></button>
                  </div>
                </Card>
              ))}
            </section>
          )
        })}
      </div>
    </div>
  )
}
