import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Copy, FileUp, FolderOpen, Loader2, Pencil, Plus, Trash2, Wand2, X } from 'lucide-react'
import { useDialogs } from './Dialogs.jsx'
import { cleanGeneratedSkill, emptySkill, serializeSkill, skillGenerationMessages } from '../lib/skills.js'
import { languageEnglishName, t } from '../i18n/index.js'

const api = window.electronAPI
const fieldClass = 'mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-accent-400'
// Campi su una riga (esempi, azioni): senza margine sopra.
const inlineField = fieldClass.replace('mt-1 ', '')
const smallButton = 'flex items-center gap-1.5 rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-slate-600 disabled:opacity-50'
const iconButton = 'rounded p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-50'

// Finestra modale sopra le impostazioni: Esc la chiude senza chiudere anche le impostazioni sotto.
function Modal({ label, onClose, children, wide = false }) {
  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={label} className={`my-4 grid w-full gap-4 rounded-xl border border-slate-700 bg-slate-900 p-5 text-slate-200 shadow-xl ${wide ? 'max-w-3xl' : 'max-w-xl'}`}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold">{label}</h3>
          <button type="button" aria-label={t('Close')} title={t('Close (Esc)')} className={iconButton} onClick={onClose}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

/**
 * Editor di una skill. `initial`: campi della skill più { id, scope, base } se esiste già.
 * `targets`: dove si può salvare una skill nuova ([{ scope, base, label }]); per una skill esistente si salva dov'è.
 */
export function SkillEditor({ initial, targets = [], onSaved, onClose }) {
  const [form, setForm] = useState(() => ({ ...emptySkill(), ...initial, examples: [...(initial?.examples || [])], actions: [...(initial?.actions || [])] }))
  const [target, setTarget] = useState(0)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const existing = Boolean(initial?.id)
  const update = (changes) => setForm((current) => ({ ...current, ...changes }))
  const setListItem = (key, index, value) => update({ [key]: form[key].map((item, position) => (position === index ? value : item)) })
  const removeListItem = (key, index) => update({ [key]: form[key].filter((_, position) => position !== index) })

  async function save() {
    if (!form.name.trim()) { setError(t('Give the skill a name')); return }
    if (!form.instructions.trim() && !form.examples.some((example) => example.trim())) { setError(t('Write some instructions or at least one example')); return }
    const place = existing ? { scope: initial.scope, base: initial.base } : targets[target]
    if (!place) { setError(t('Choose where to save the skill')); return }
    setSaving(true)
    try {
      const saved = await api.skills.save({ scope: place.scope, base: place.base, id: existing ? initial.id : undefined, markdown: serializeSkill(form) })
      onSaved?.(saved)
    } catch (reason) {
      setError(reason.message)
      setSaving(false)
    }
  }

  return (
    <Modal label={existing ? t('Edit skill') : t('New skill')} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm text-slate-300">{t('Name')}<input autoFocus value={form.name} maxLength={120} className={fieldClass} placeholder={t('e.g. Journalistic tone')} onChange={(event) => update({ name: event.target.value })} /></label>
        <label className="text-sm text-slate-300">{t('Description')}<input value={form.description} maxLength={300} className={fieldClass} placeholder={t('When to use it')} onChange={(event) => update({ description: event.target.value })} /></label>
      </div>
      <label className="text-sm text-slate-300">{t('Instructions')}<textarea
          value={form.instructions}
          rows={9}
          className={`${fieldClass} resize-y font-mono leading-6`}
          placeholder={t('Style, tone of voice, rules, glossary, things to avoid…')}
          onChange={(event) => update({ instructions: event.target.value })}
        />
      </label>

      <div className="grid gap-2 text-sm text-slate-300">
        <div className="flex items-center justify-between gap-2">
          <span>{t('Reference examples')}<span className="block text-xs text-slate-500">{t('Passages written in the target style: the assistant imitates their style, not their content.')}</span></span>
          <button type="button" className={smallButton} onClick={() => update({ examples: [...form.examples, ''] })}><Plus size={13} /> {t('Add example')}</button>
        </div>
        {form.examples.map((example, index) => (
          <div key={index} className="flex items-start gap-1.5">
            <textarea value={example} rows={4} aria-label={t('Example {value}', { value: index + 1 })} className={`${inlineField} resize-y leading-6`} onChange={(event) => setListItem('examples', index, event.target.value)} />
            <button type="button" aria-label={t('Remove')} title={t('Remove')} className={iconButton} onClick={() => removeListItem('examples', index)}><X size={14} /></button>
          </div>
        ))}
      </div>

      <div className="grid gap-2 text-sm text-slate-300">
        <div className="flex items-center justify-between gap-2">
          <span>{t('Quick actions')}<span className="block text-xs text-slate-500">{t('Buttons shown in the chat while the skill is active.')}</span></span>
          <button type="button" disabled={form.actions.length >= 6} className={smallButton} onClick={() => update({ actions: [...form.actions, { label: '', prompt: '' }] })}><Plus size={13} /> {t('Add action')}</button>
        </div>
        {form.actions.map((action, index) => (
          <div key={index} className="flex items-start gap-1.5">
            <input value={action.label} maxLength={60} aria-label={t('Button label')} placeholder={t('Label')} className={`${inlineField.replace('w-full ', '')} w-40 shrink-0`} onChange={(event) => setListItem('actions', index, { ...action, label: event.target.value })} />
            <input value={action.prompt} aria-label={t('Prompt')} placeholder={t('What the assistant should do')} className={`${inlineField} min-w-0`} onChange={(event) => setListItem('actions', index, { ...action, prompt: event.target.value })} />
            <button type="button" aria-label={t('Remove')} title={t('Remove')} className={iconButton} onClick={() => removeListItem('actions', index)}><X size={14} /></button>
          </div>
        ))}
      </div>

      {!existing && targets.length > 1 && (
        <label className="text-sm text-slate-300">{t('Save in')}<select className={fieldClass} value={target} onChange={(event) => setTarget(Number(event.target.value))}>
            {targets.map((item, index) => <option key={index} value={index}>{item.label}</option>)}
          </select>
        </label>
      )}

      <div className="flex items-center justify-end gap-3">
        {error && <span className="mr-auto text-sm text-rose-400">{error}</span>}
        <button type="button" className="rounded-md px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800" onClick={onClose}>{t('Cancel')}</button>
        <button type="button" disabled={saving} className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-500 disabled:opacity-50" onClick={save}>{t('Save skill')}</button>
      </div>
    </Modal>
  )
}

/**
 * Genera una skill con l'AI. `source: 'text'` (un testo d'esempio, modificabile qui) o 'conversation' (trascrizione già pronta).
 * A risposta arrivata chiama `onGenerated(campi)`: la skill non viene salvata, si apre l'editor per rivederla.
 */
export function GenerateSkillDialog({ source = 'text', text = '', onGenerated, onClose }) {
  const [material, setMaterial] = useState(text)
  const [hint, setHint] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(null)

  useEffect(() => () => request.current?.cancel(), [])

  async function generate() {
    setBusy(true)
    setError('')
    try {
      const settings = await api.ai.getSettings()
      if (!settings?.aiEnabled) throw new Error(t('The AI assistant is turned off. Enable it and choose a provider in the settings.'))
      request.current = api.ai.chatStream(skillGenerationMessages({ source, text: material, hint, language: settings.language || languageEnglishName() }), () => {})
      const reply = cleanGeneratedSkill(await request.current.promise)
      request.current = null
      const parsed = await api.skills.parse(reply)
      // Risposta fuori formato: la si tiene comunque come istruzioni, da sistemare a mano.
      onGenerated(parsed.name && (parsed.instructions || parsed.examples.length) ? parsed : { ...emptySkill(), instructions: reply })
    } catch (reason) {
      request.current = null
      setError(reason.message)
      setBusy(false)
    }
  }

  const conversation = source === 'conversation'
  return (
    <Modal label={conversation ? t('Create a skill from this conversation') : t('Create a skill from a text')} onClose={() => { request.current?.cancel(); onClose() }}>
      <p className="text-sm leading-6 text-slate-400">{conversation
        ? t('The assistant turns the preferences you expressed in this conversation (corrections, tone, approved texts) into reusable rules. You can review the skill before saving it.')
        : t('The assistant analyses the style of the text and turns it into reusable rules and examples. You can review the skill before saving it.')}</p>
      {!conversation && (
        <label className="text-sm text-slate-300">{t('Sample text')}<textarea value={material} rows={10} className={`${fieldClass} resize-y leading-6`} placeholder={t('Paste a text written in the style you want to reproduce…')} onChange={(event) => setMaterial(event.target.value)} /></label>
      )}
      <label className="text-sm text-slate-300">{t('Focus (optional)')}<input value={hint} className={fieldClass} placeholder={t('e.g. only the tone, ignore the formatting')} onChange={(event) => setHint(event.target.value)} /></label>
      <div className="flex items-center justify-end gap-3">
        {error && <span className="mr-auto text-sm text-rose-400">{error}</span>}
        {busy && <span className="mr-auto flex items-center gap-1.5 text-sm text-slate-400"><Loader2 size={14} className="animate-spin" /> {t('Generating the skill…')}</span>}
        <button type="button" className="rounded-md px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800" onClick={() => { request.current?.cancel(); onClose() }}>{t('Cancel')}</button>
        <button type="button" disabled={busy || !material.trim()} className="flex items-center gap-1.5 rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-500 disabled:opacity-50" onClick={generate}><Wand2 size={14} /> {t('Generate')}</button>
      </div>
    </Modal>
  )
}

/**
 * Elenco e gestione delle skill.
 * `scope: 'global'`: la libreria comune a tutti i progetti. `scope: 'project'`: le skill del progetto (`projectPath`, altrimenti quello aperto),
 * con la scelta di quelle attive di default in ogni conversazione.
 */
export default function SkillsManager({ scope, projectPath = null, onChanged }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [generating, setGenerating] = useState(false)
  const dialogs = useDialogs()
  const project = scope === 'project'

  async function reload() {
    try {
      setData(await api.skills.list(project && projectPath ? { directory: projectPath } : {}))
      setError('')
    } catch (reason) {
      setError(reason.message)
    }
  }
  useEffect(() => { reload() }, [scope, projectPath])

  if (error && !data) return <p className="text-sm text-rose-400">{error}</p>
  if (!data) return null

  const own = project ? data.chain.at(-1) : null
  if (project && !own) return null
  const ownActive = own?.activeSkills || []
  const inherited = new Map(data.chain.slice(0, -1).flatMap((owner) => (owner.activeSkills || []).map((id) => [id, owner.name])))
  const mine = (skill) => (project ? skill.scope === 'project' && skill.base === own.base : skill.scope === 'global')
  const shown = data.skills.filter((skill) => (project ? !skill.shadowed : skill.scope === 'global'))
  const problems = data.problems.filter((problem) => (project ? problem.scope === 'project' && problem.base === own.base : problem.scope === 'global'))
  const place = project ? { scope: 'project', base: own.base } : { scope: 'global', base: null }
  const changed = () => { reload(); onChanged?.() }

  async function toggleActive(id, active) {
    const next = active ? [...ownActive, id] : ownActive.filter((item) => item !== id)
    // La spunta cambia subito; la rilettura da disco arriva subito dopo.
    setData((current) => ({ ...current, chain: current.chain.map((owner, index) => (index === current.chain.length - 1 ? { ...owner, activeSkills: next } : owner)) }))
    try {
      await api.skills.setActive({ directory: projectPath || undefined, active: next })
      changed()
    } catch (reason) { setError(reason.message); reload() }
  }

  // Skill da un file Markdown con le direttive: si apre l'editor per rivederla prima di salvarla.
  async function importFile() {
    try {
      const fields = await api.skills.importFile()
      if (fields) setEditing({ ...emptySkill(), ...fields })
    } catch (reason) { setError(reason.message) }
  }

  async function open(skill) {
    try { setEditing(await api.skills.get({ scope: skill.scope, base: skill.base, id: skill.id })) } catch (reason) { setError(reason.message) }
  }

  async function remove(skill) {
    if (!(await dialogs.confirm(t('Delete the skill "{name}"? The file {id}.md will be removed.', { name: skill.name, id: skill.id }), { danger: true, confirmLabel: t('Delete') }))) return
    try { await api.skills.remove({ scope: skill.scope, base: skill.base, id: skill.id }); changed() } catch (reason) { setError(reason.message) }
  }

  // Copia una skill nell'altro ambito (dal progetto alla libreria globale o viceversa) come skill nuova.
  async function copy(skill, destination) {
    try {
      const full = await api.skills.get({ scope: skill.scope, base: skill.base, id: skill.id })
      await api.skills.save({ ...destination, markdown: full.markdown })
      changed()
    } catch (reason) { setError(reason.message) }
  }

  const origin = (skill) => (skill.scope === 'global' ? t('Global') : skill.base === own?.base ? t('This project') : skill.owner)

  return (
    <div className="grid grid-cols-1 gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={smallButton} onClick={() => setEditing({ ...emptySkill() })}><Plus size={13} /> {t('New skill')}</button>
        <button type="button" className={smallButton} onClick={() => setGenerating(true)}><Wand2 size={13} /> {t('Create from a text…')}</button>
        <button type="button" className={smallButton} title={t('Create a skill from a Markdown file with the directives')} onClick={importFile}><FileUp size={13} /> {t('Import from a Markdown file…')}</button>
        <button type="button" className={smallButton} onClick={() => api.skills.openFolder(place).catch((reason) => setError(reason.message))}><FolderOpen size={13} /> {t('Open folder')}</button>
      </div>

      {shown.length === 0 && <p className="text-sm text-slate-500">{project ? t('No skills yet. Create one here, or add skills to the global library in Settings → Skills.') : t('No skills yet. A skill collects style, tone and rules that you can reuse in every project.')}</p>}

      <ul className="grid grid-cols-1 gap-1.5">
        {shown.map((skill) => {
          const from = inherited.get(skill.id)
          const active = ownActive.includes(skill.id) || Boolean(from)
          return (
            <li key={`${skill.scope}:${skill.base}:${skill.id}`} className="flex min-w-0 items-start gap-3 rounded-lg border border-slate-800 px-3 py-2">
              {project && (
                <input
                  type="checkbox"
                  checked={active}
                  disabled={Boolean(from)}
                  title={from ? t('Active by default in “{name}”', { name: from }) : t('Active by default in every conversation')}
                  aria-label={t('Active by default')}
                  className="mt-1 accent-accent-500"
                  onChange={(event) => toggleActive(skill.id, event.target.checked)}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-slate-200">{skill.name}{project && <span className="ml-2 text-xs text-slate-500">{origin(skill)}</span>}</p>
                {skill.description && <p className="truncate text-xs text-slate-500">{skill.description}</p>}
                {from && <p className="text-xs text-slate-500">{t('Active by default in “{name}”', { name: from })}</p>}
              </div>
              <div className="flex shrink-0 gap-0.5">
                {mine(skill) && <button type="button" aria-label={t('Edit')} title={t('Edit')} className={iconButton} onClick={() => open(skill)}><Pencil size={14} /></button>}
                {project && skill.scope === 'project' && <button type="button" aria-label={t('Copy to the global library')} title={t('Copy to the global library')} className={iconButton} onClick={() => copy(skill, { scope: 'global' })}><Copy size={14} /></button>}
                {project && skill.scope === 'global' && <button type="button" aria-label={t('Copy into this project')} title={t('Copy into this project, to adapt it')} className={iconButton} onClick={() => copy(skill, place)}><Copy size={14} /></button>}
                {mine(skill) && <button type="button" aria-label={t('Delete')} title={t('Delete')} className={`${iconButton} hover:text-rose-400`} onClick={() => remove(skill)}><Trash2 size={14} /></button>}
              </div>
            </li>
          )
        })}
      </ul>

      {problems.length > 0 && (
        <div className="grid gap-1 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-500">
          {problems.map((problem) => <p key={problem.file} className="flex items-start gap-1.5 break-all"><AlertTriangle size={13} className="mt-0.5 shrink-0" /> {problem.file}: {problem.message}</p>)}
        </div>
      )}
      {error && <p className="text-sm text-rose-400">{error}</p>}

      {editing && <SkillEditor initial={editing} targets={[{ ...place, label: '' }]} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); changed() }} />}
      {generating && <GenerateSkillDialog source="text" onClose={() => setGenerating(false)} onGenerated={(fields) => { setGenerating(false); setEditing(fields) }} />}
    </div>
  )
}
