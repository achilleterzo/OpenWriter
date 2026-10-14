import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Pencil, Plus, RotateCcw, X } from 'lucide-react'
import { useDialogs } from './Dialogs.jsx'
import { MAX_CUSTOM_QUICK_ACTIONS, MAX_QUICK_LABEL, MAX_QUICK_PROMPT, defaultTextOf, newCustomId, quickActionsOf, resolveQuickActions, toEntry } from '../lib/quickActions.js'
import { t } from '../i18n/index.js'

const ai = window.electronAPI?.ai
const fieldClass = 'mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-accent-400'
const iconButton = 'rounded p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-50 disabled:opacity-30 disabled:hover:bg-transparent'

// Finestra di modifica di una singola azione: etichetta del pulsante e prompt. Per un'azione di default si può rimettere il testo originale.
function ActionDialog({ initial, onSave, onClose }) {
  const original = defaultTextOf(initial.id)
  const [label, setLabel] = useState(initial.label)
  const [prompt, setPrompt] = useState(initial.prompt)
  const valid = label.trim() && prompt.trim()
  const changed = original && (label !== original.label || prompt !== original.prompt)

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  function submit(event) {
    event.preventDefault()
    if (valid) onSave({ ...initial, label: label.trim(), prompt: prompt.trim() })
  }

  const title = initial.isNew ? t('New action') : t('Edit action')
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form role="dialog" aria-modal="true" aria-label={title} className="my-4 grid w-full max-w-2xl gap-4 rounded-xl border border-slate-700 bg-slate-900 p-5 text-slate-200 shadow-xl" onSubmit={submit}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold">{title}</h3>
          <button type="button" aria-label={t('Close')} title={t('Close (Esc)')} className={iconButton} onClick={onClose}><X size={16} /></button>
        </div>
        <label className="text-sm text-slate-300">{t('Button label')}
          <input autoFocus value={label} maxLength={MAX_QUICK_LABEL} placeholder={t('Label')} className={fieldClass} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label className="text-sm text-slate-300">{t('Prompt')}
          <span className="block text-xs text-slate-500">{t('What the assistant should do with the text you have selected or the open document.')}</span>
          <textarea value={prompt} rows={10} maxLength={MAX_QUICK_PROMPT} placeholder={t('What the assistant should do')} className={`${fieldClass} resize-y leading-6`} onChange={(event) => setPrompt(event.target.value)} />
        </label>
        <div className="flex items-center justify-between gap-3">
          {original
            ? <button type="button" disabled={!changed} className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent" onClick={() => { setLabel(original.label); setPrompt(original.prompt) }}><RotateCcw size={14} /> {t('Reset to default')}</button>
            : <span />}
          <div className="flex items-center gap-3">
            <button type="button" className="rounded-md px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800" onClick={onClose}>{t('Cancel')}</button>
            <button type="submit" disabled={!valid} className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-500 disabled:opacity-50">{t('Save')}</button>
          </div>
        </div>
      </form>
    </div>
  )
}

// Azioni rapide della chat. Quelle di default non si eliminano: si modificano e si ripristinano (una per una o tutte insieme).
// Quelle create dall'utente si possono anche eliminare.
export default function QuickActionsSettings() {
  const dialogs = useDialogs()
  const [actions, setActions] = useState(null)
  // Almeno una modifica rispetto ai default (ordine, testi, azioni aggiunte): abilita "Ripristina tutte".
  const [customized, setCustomized] = useState(false)
  // Azione in modifica: l'azione più `isNew` per una nuova.
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const settingsRef = useRef(null)

  useEffect(() => {
    if (!ai) return
    ai.getSettings().then((loaded) => {
      settingsRef.current = loaded
      setCustomized(Array.isArray(loaded.quickActions))
      setActions(quickActionsOf(loaded))
    }).catch((reason) => setError(reason.message))
  }, [])

  // `value`: le voci da salvare, o null per tornare ai default.
  async function save(value) {
    try {
      settingsRef.current = await ai.saveSettings({ ...settingsRef.current, quickActions: value })
      setError('')
    } catch (reason) {
      setError(reason.message)
    }
  }

  function change(next) {
    setActions(next)
    setCustomized(true)
    save(next.map(toEntry))
  }

  const remove = (index) => change(actions.filter((_action, position) => position !== index))
  const move = (index, step) => {
    const target = index + step
    if (target < 0 || target >= actions.length) return
    const next = [...actions]
    ;[next[index], next[target]] = [next[target], next[index]]
    change(next)
  }
  const restoreOne = (index) => change(actions.map((action, position) => (position === index ? { ...action, ...defaultTextOf(action.id) } : action)))

  function saveEditing(action) {
    const { isNew, ...saved } = action
    change(isNew ? [...actions, saved] : actions.map((item) => (item.id === saved.id ? saved : item)))
    setEditing(null)
  }

  async function resetAll() {
    if (!(await dialogs.confirm(t('Restore all the default quick actions? Your changes and the actions you added will be lost.'), { confirmLabel: t('Restore') }))) return
    setActions(resolveQuickActions(null))
    setCustomized(false)
    save(null)
  }

  if (!actions) return <p className="text-sm text-slate-500">{error || t('Loading…')}</p>

  const customCount = actions.filter((action) => !action.isDefault).length
  return (
    <section className="grid grid-cols-1 gap-4 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
      <p className="max-w-xl text-sm leading-6 text-slate-400">{t('The buttons shown in the chat above the message box: each one sends its prompt with the text you have selected or the open document. They are the same in every project; writing skills can add their own.')} {t('The default actions cannot be removed: you can edit them and restore their original text.')}</p>

      <ul className="grid grid-cols-1 gap-1.5">
        {actions.map((action, index) => (
          <li key={action.id} className="flex min-w-0 items-center gap-1 rounded-lg border border-slate-800 bg-slate-900/60 py-1.5 pl-3 pr-1.5">
            <button type="button" title={action.prompt} className="min-w-0 flex-1 overflow-hidden text-left" onClick={() => setEditing(action)}>
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-slate-100">{action.label}</span>
                {action.modified && <span className="shrink-0 rounded-full border border-accent-500/40 px-1.5 text-[10px] text-accent-400">{t('Modified')}</span>}
              </span>
              <span className="block truncate text-xs text-slate-500">{action.prompt}</span>
            </button>
            <button type="button" aria-label={t('Move up')} title={t('Move up')} disabled={index === 0} className={iconButton} onClick={() => move(index, -1)}><ChevronUp size={14} /></button>
            <button type="button" aria-label={t('Move down')} title={t('Move down')} disabled={index === actions.length - 1} className={iconButton} onClick={() => move(index, 1)}><ChevronDown size={14} /></button>
            <button type="button" aria-label={t('Edit')} title={t('Edit')} className={iconButton} onClick={() => setEditing(action)}><Pencil size={14} /></button>
            {action.isDefault
              ? <button type="button" aria-label={t('Reset to default')} title={t('Reset to default')} disabled={!action.modified} className={iconButton} onClick={() => restoreOne(index)}><RotateCcw size={14} /></button>
              : <button type="button" aria-label={t('Remove')} title={t('Remove')} className={iconButton} onClick={() => remove(index)}><X size={14} /></button>}
          </li>
        ))}
      </ul>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <div className="flex items-center justify-between gap-3">
        <button type="button" disabled={customCount >= MAX_CUSTOM_QUICK_ACTIONS} className="flex items-center gap-1.5 rounded-md bg-slate-700 px-3 py-2 text-sm font-medium text-slate-100 transition hover:bg-slate-600 disabled:opacity-50" onClick={() => setEditing({ id: newCustomId(), label: '', prompt: '', isDefault: false, isNew: true })}><Plus size={14} /> {t('Add action')}</button>
        <button type="button" disabled={!customized} className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent" onClick={resetAll}><RotateCcw size={14} /> {t('Reset all to default')}</button>
      </div>

      {editing && <ActionDialog initial={editing} onSave={saveEditing} onClose={() => setEditing(null)} />}
    </section>
  )
}
