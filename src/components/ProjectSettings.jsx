import { useEffect, useState } from 'react'
import { Camera, Check, FolderCog, X } from 'lucide-react'
import { ProjectAvatar } from './ProjectIcon.jsx'
import SkillsManager from './SkillsManager.jsx'
import { ProjectQuickActions } from './QuickActionsSettings.jsx'
import { chooseProjectIcon, invalidateProjectIcon, useProjectIcon } from '../lib/projectIcons.js'
import SpellcheckLanguages from './SpellcheckLanguages.jsx'
import { EditorFontChoice } from './FontPicker.jsx'
import ParameterSlider from './ParameterSlider.jsx'
import { TEMPERATURE_MAX, TEMPERATURE_MIN, TEMPERATURE_STEP, formatTemperature, levelOf } from '../lib/temperature.js'
import { setProjectEditor } from '../appearance.js'
import { formatNumber } from '../i18n/index.js'
import { samePath } from '../lib/pathCompare.js'
import { SettingsHeaderActions } from './SettingsActions.jsx'
import { t } from '../i18n/index.js'
import { toolOptions } from '../lib/toolOptions.js'
import Switch from './Switch.jsx'

const electronAPI = window.electronAPI
const languages = ['Italiano', 'English', 'Español', 'Français', 'Deutsch', 'Português']
// Il nome della cartella del progetto: da `settings.path` (la cartella .ow dentro il progetto) o, se si conosce, dal percorso del progetto.
const folderOf = (settings, projectPath) => {
  const source = projectPath || (settings?.path ? String(settings.path).replace(/[\\/]+\.ow[\\/]*$/i, '') : '')
  return String(source).split(/[\\/]/).filter(Boolean).at(-1) || ''
}
const fieldClass = 'mt-2 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2.5 text-slate-100 outline-none placeholder:text-slate-500 focus:border-accent-400'

// Dove sta il progetto sul disco: il percorso, e lo spostamento in un'altra cartella (la `.ow` si porta dietro tutto).
function ProjectLocation({ directory, onMove, onError }) {
  const [busy, setBusy] = useState(false)
  if (!directory) return null

  async function move() {
    setBusy(true)
    try { await onMove(directory) } catch (reason) { onError(reason.message) } finally { setBusy(false) }
  }

  return (
    <div className="text-sm text-slate-300">
      {t('Location')}
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-300" title={directory}>{directory}</code>
        <button type="button" disabled={busy} className="shrink-0 rounded-md bg-slate-700 px-3 py-2 text-xs font-medium text-slate-100 transition hover:bg-slate-600 disabled:opacity-50" onClick={move}>{t('Move…')}</button>
      </div>
    </div>
  )
}

// Icona del progetto: l'anteprima stessa è il pulsante per scegliere un'immagine (png, jpg, svg…), ridimensionata e tenuta nella `.ow`.
// Senza immagine si vede l'avatar generato dal nome. Compare nell'elenco dei progetti e nell'albero dei file.
function ProjectIconField({ directory, name, onChanged, onError }) {
  const icon = useProjectIcon(directory)
  const [busy, setBusy] = useState(false)
  if (!directory) return null

  async function choose() {
    setBusy(true)
    try {
      if (await chooseProjectIcon(directory, { unreadable: t('The image could not be read') })) onChanged?.()
    } catch (reason) {
      onError(reason.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    try {
      await electronAPI.removeProjectIcon(directory)
      invalidateProjectIcon(directory)
      onChanged?.()
    } catch (reason) {
      onError(reason.message)
    }
  }

  const label = name || directory.split(/[\\/]/).filter(Boolean).at(-1) || directory
  return (
    <div className="group relative shrink-0">
      <button type="button" disabled={busy} aria-label={t('Choose the project icon')} title={t('Choose the project icon')} className="relative block rounded-full outline-none ring-accent-400 transition focus-visible:ring-2 disabled:opacity-60" onClick={choose}>
        <ProjectAvatar directory={directory} name={label} active size={72} />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-slate-950/60 text-slate-50 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"><Camera size={20} /></span>
      </button>
      {icon && <button type="button" aria-label={t('Remove the image')} title={t('Remove the image')} className="absolute -right-1 -top-1 rounded-full border border-slate-700 bg-slate-900 p-1 text-slate-400 opacity-0 transition hover:text-slate-50 group-hover:opacity-100 focus:opacity-100" onClick={remove}><X size={11} /></button>}
    </div>
  )
}

// `embedded`: dentro una finestra che ha già il suo riquadro (e scorre da sola): niente bordo e sfondo propri.
export default function ProjectSettings({ project, projectPath = null, onChanged, onEditContext, onMove, onSaved, embedded = false }) {
  const [form, setForm] = useState(null)
  const [spellcheck, setSpellcheck] = useState({ available: [], global: [] })
  // Livello della temperatura generale del provider attivo: è quello che il progetto eredita finché non ne sceglie uno.
  const [generalTemperature, setGeneralTemperature] = useState('')
  // Strumenti accesi nelle impostazioni generali: il progetto li eredita finché non ne cambia uno.
  const [generalTools, setGeneralTools] = useState({})
  const generalApprove = electronAPI.preferences?.values?.['openwriter.autoApprove'] === 'on'
  const [info, setInfo] = useState({ available: false })
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    electronAPI.getSpellcheck().then(setSpellcheck)
    electronAPI.ai.getSettings().then((ai) => { setGeneralTools(ai.tools || {}); setGeneralTemperature(levelOf(ai.provider, ai.providers?.[ai.provider]?.temperature)) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!project) { setInfo({ available: false }); setForm(null); return }
    // Con `projectPath` si modificano le impostazioni di quel progetto (anche non aperto); altrimenti quelle del progetto aperto.
    ;(projectPath ? electronAPI.getProjectSettingsFor(projectPath) : electronAPI.getProjectSettings()).then((settings) => {
      setInfo(settings)
      // Senza un nome scelto, il campo parte dal nome della cartella (che resta il nome finché non lo si cambia).
      setForm({ name: settings.name || folderOf(settings, projectPath), language: settings.ai.language, documentLanguage: settings.ai.documentLanguage || '', temperature: settings.ai.temperature ?? '', autoApprove: settings.ai.autoApprove || '', tools: settings.ai.tools || {}, context: settings.ai.context, autoVersions: settings.options.autoVersions, searchIndex: settings.options.searchIndex !== false, sharedKnowledge: settings.options.sharedKnowledge !== false, inherit: settings.inherit === true, spellcheck: settings.spellcheck.languages, editor: settings.editor })
    }).catch((reason) => setError(reason.message))
  }, [project, projectPath, reloadToken])

  // Gli interruttori mostrano lo stato efficace (scelta del progetto, altrimenti quella generale). Tornare al valore generale toglie la scelta: il progetto riprende a ereditare.
  const toolOn = (key) => (typeof form.tools[key] === 'boolean' ? form.tools[key] : Boolean(generalTools[key]))
  const setTool = (key, value) => {
    const next = { ...form.tools }
    if (value === Boolean(generalTools[key])) delete next[key]
    else next[key] = value
    update({ tools: next })
  }
  const approveOn = form?.autoApprove ? form.autoApprove === 'on' : generalApprove

  function update(changes) {
    setSaved(false)
    setForm((current) => ({ ...current, ...changes }))
  }

  async function save() {
    try {
      // Il nome uguale a quello della cartella non si salva: il progetto continua a seguire la cartella (se la si rinomina o sposta).
      const payload = ({ name: form.name.trim() === folderOf(info, projectPath) ? '' : form.name, ai: { context: form.context, language: form.language, documentLanguage: form.documentLanguage, temperature: form.temperature, autoApprove: form.autoApprove, tools: form.tools }, options: { autoVersions: form.autoVersions, searchIndex: form.searchIndex, sharedKnowledge: form.sharedKnowledge }, ...(info.parent ? { inherit: form.inherit } : {}), spellcheck: { languages: form.spellcheck }, editor: form.editor })
      const result = await (projectPath ? electronAPI.saveProjectSettingsFor(projectPath, payload) : electronAPI.saveProjectSettings(payload))
      // Se è il progetto aperto, il carattere cambia subito.
      const open = await electronAPI.getProject()
      if (!projectPath || (open && samePath(projectPath, String(open)))) setProjectEditor(result.editor)
      onChanged?.()
      setInfo(result)
      setSaved(true)
      setError('')
      // `onSaved`: chi ospita le impostazioni può chiuderle dopo il salvataggio (la finestra del singolo progetto lo fa).
      onSaved?.()
    } catch (reason) {
      setError(reason.message)
    }
  }

  const contextLength = formatNumber(form?.context.length ?? 0)
  const contextLimit = formatNumber(20000)

  if (!project) return <p className="text-sm text-slate-400">{t('Open a project folder to configure its settings.')}</p>
  if (error && !form) return <p className="text-sm text-rose-400">{error}</p>
  if (!form) return null

  const saveActions = (
    <>
      {error && <span className="min-w-0 truncate text-sm text-rose-400" title={error}>{error}</span>}
      {saved && <span className="flex shrink-0 items-center gap-1 text-sm text-emerald-400"><Check size={15} /> {t('Saved')}</span>}
      <button type="button" className="shrink-0 rounded-md bg-accent-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-500" onClick={save}>{t('Save settings')}</button>
    </>
  )

  return (
    <section className={embedded ? 'grid grid-cols-1 gap-5 p-5' : 'grid grid-cols-1 gap-5 rounded-xl border border-slate-800 bg-slate-950/40 p-6'}>
      <div>
        <div className="flex items-center gap-2">
          <FolderCog className="text-accent-400" size={20} />
          <h2 className="text-lg font-semibold">{t('Project settings')}</h2>
        </div>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">{t('Saved in the project\'s .ow folder, together with the version history: you can version it or copy it along with the project.')}</p>
      </div>

      <div className="flex items-center gap-4">
        <ProjectIconField directory={projectPath || (typeof project === 'string' ? project : '')} name={form.name} onChanged={onChanged} onError={setError} />
        <label className="min-w-0 flex-1 text-sm text-slate-300">{t('Project name')}<span className="mt-2 flex items-stretch rounded-md border border-slate-700 bg-slate-800 focus-within:border-accent-400">
            <span aria-hidden="true" className="flex select-none items-center border-r border-slate-700 px-3 text-slate-500">@</span>
            <input value={form.name} maxLength={200} className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-slate-100 outline-none placeholder:text-slate-500" placeholder={t('Optional')} onChange={(event) => update({ name: event.target.value.replace(/^@+/, '') })} />
          </span>
        </label>
      </div>

      {onMove && <ProjectLocation directory={projectPath || (typeof project === 'string' ? project : '')} onMove={onMove} onError={setError} />}

      {info.parent && (
        <label className="flex items-start gap-3 text-sm text-slate-300">
          <Switch checked={Boolean(form.inherit)} onChange={(value) => update({ inherit: value })} />
          <span>{t('Inherit the context of the parent project “{name}”', { name: info.parent.name })}
            <span className="mt-1 block text-xs text-slate-500">{t('The assistant also receives the parent project\'s instructions, followed by this project\'s, which take precedence. When this project is worked on from the parent, it always inherits unless you turn this off.')}</span>
          </span>
        </label>
      )}

      <label className="text-sm text-slate-300">{t('Context for the AI')}<textarea
          value={form.context}
          rows={9}
          className={`${fieldClass} resize-y font-mono text-sm leading-6`}
          placeholder={t('Audience, tone, glossary, style rules…\nThe assistant reads it in every conversation.')}
          onChange={(event) => update({ context: event.target.value })}
        />
        <span className="mt-1 block text-xs text-slate-500">{t('Saved in .ow/context.md, so you can also edit it by hand. {contextLength} / {contextLimit} characters.', { contextLength, contextLimit })}</span>
      </label>
      {onEditContext && info.path && (
        <div className="-mt-3 flex items-center gap-3">
          <button type="button" className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-slate-600" onClick={() => onEditContext(`${info.path.replace(/[\\/]+$/, '')}/context.md`)}>{t('Edit in the editor')}</button>
          <span className="text-xs text-slate-500">{t('Opens .ow/context.md as a document. Unsaved changes in this form are not carried over.')}</span>
        </div>
      )}

      <label className="text-sm text-slate-300">{t('AI reply language in this project')}<select className={fieldClass} value={form.language} onChange={(event) => update({ language: event.target.value })}>
          <option value="">{t('Default (AI settings)')}</option>
          {[...new Set([...languages, form.language].filter(Boolean))].map((language) => <option key={language} value={language}>{language}</option>)}
        </select>
      </label>

      <label className="text-sm text-slate-300">{t('Language of the documents in this project')}<select className={fieldClass} value={form.documentLanguage} onChange={(event) => update({ documentLanguage: event.target.value })}>
          <option value="">{t('Same as the reply language')}</option>
          {[...new Set([...languages, form.documentLanguage].filter(Boolean))].map((language) => <option key={language} value={language}>{language}</option>)}
        </select>
        <span className="mt-1 block text-xs text-slate-500">{t('The assistant replies to you in the reply language, but writes rewrites, corrections, new files and proposed replacements in the language of the documents.')}</span>
      </label>

      <ParameterSlider id="project-temperature" label={t('Temperature in this project')} value={form.temperature} inherited={generalTemperature} onChange={(value) => update({ temperature: value })} min={TEMPERATURE_MIN} max={TEMPERATURE_MAX} step={TEMPERATURE_STEP} format={formatTemperature} />

      <fieldset className="grid gap-3 rounded-lg border border-slate-800 p-4">
        <legend className="px-1 text-sm text-slate-300">{t('Assistant tools in this project')}</legend>
        {toolOptions.map(({ key, label, help }) => (
          <label key={key} className="flex items-start gap-3 text-sm text-slate-300">
            <Switch checked={toolOn(key)} onChange={(value) => setTool(key, value)} />
            <span>{label}<span className="block text-xs text-slate-500">{help}</span></span>
          </label>
        ))}
        <label className="flex items-start gap-3 border-t border-slate-800 pt-3 text-sm text-slate-300">
          <Switch checked={approveOn} onChange={(value) => update({ autoApprove: value === generalApprove ? '' : value ? 'on' : 'off' })} />
          <span>{t('Approve the assistant\'s edits for me')}<span className="block text-xs text-slate-500">{t('“Approve for me”: when the work is done the assistant\'s edits are accepted and saved, and the documents it opened are closed again. The previous version stays in the history.')}</span></span>
        </label>
      </fieldset>

      <div className="grid gap-2 text-sm text-slate-300">
        <span>{t('Spell checker languages in this project')}</span>
        <SpellcheckLanguages
          available={spellcheck.available}
          value={form.spellcheck}
          emptyHint={t('Default: {value}', { value: spellcheck.global.join(', ') || t('None') })}
          onChange={(languages) => update({ spellcheck: languages })}
        />
        <span className="text-xs text-slate-500">{t('If you choose none, the ones from the general settings apply.')}</span>
      </div>

      <div className="grid gap-2 text-sm text-slate-300">
        <span>{t('Editor font in this project')}</span>
        <EditorFontChoice allowDefault font={form.editor.font} fontFamily={form.editor.fontFamily} onChange={(editor) => update({ editor })} />
        <span className="text-xs text-slate-500">{t('Replaces the general font in this project.')}</span>
      </div>

      <label className="flex items-start gap-3 text-sm text-slate-300">
        <Switch checked={form.autoVersions} onChange={(value) => update({ autoVersions: value })} />
        <span>{t('Save a version on every save')}<span className="block text-xs text-slate-500">{t('If the text changed. At most 100 versions are kept per document; the oldest automatic ones are discarded first.')}</span>
        </span>
      </label>

      <SearchIndex directory={projectPath || ''} enabled={form.searchIndex} saved={info.options?.searchIndex !== false} onToggle={(value) => update({ searchIndex: value })} shared={form.sharedKnowledge !== false} savedShared={info.options?.sharedKnowledge !== false} onToggleShared={(value) => update({ sharedKnowledge: value })} onError={setError} />

      <div className="grid gap-2 text-sm text-slate-300">
        <span>{t('Writing skills')}<span className="mt-1 block text-xs text-slate-500">{t('Tick the skills that the assistant applies by default in every conversation of this project; in the chat you can add or remove them for a single conversation. Project skills are saved in .ow/skills.')}</span></span>
        <SkillsManager scope="project" projectPath={projectPath} onChanged={onChanged} />
      </div>

      <div className="grid gap-2 text-sm text-slate-300">
        <span>{t('Quick actions')}</span>
        <ProjectQuickActions project={project} projectPath={projectPath} plain onChanged={onChanged} />
      </div>

      <ShareSetup target={projectPath || null} onImported={() => { onChanged?.(); setReloadToken((value) => value + 1) }} />

      <CopyContext target={projectPath || null} onCopied={() => { onChanged?.(); setReloadToken((value) => value + 1) }} />

      {/* Il salvataggio resta sempre in vista: nella finestra delle impostazioni sta a destra dell'intestazione, in quella del singolo progetto nel suo piede
          (entrambi fuori dallo spazio che scorre, vedi SettingsActions.jsx). */}
      <SettingsHeaderActions fallback={<div className="flex items-center justify-end gap-3">{saveActions}</div>}>
        {saveActions}
      </SettingsHeaderActions>
    </section>
  )
}

// Indice di ricerca per rilevanza (vedi knowledge-index.cjs): una copia derivata dai file, fuori dal progetto. Si accende e spegne per progetto
// (options.searchIndex in .ow/project.json); qui si vede quanto è aggiornato e lo si ricostruisce dai file.
function SearchIndex({ directory, enabled, saved, onToggle, shared, savedShared, onToggleShared, onError }) {
  const [status, setStatus] = useState(null)
  const [meaning, setMeaning] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = () => {
      electronAPI.getKnowledgeStatus(directory || undefined).then((value) => { if (!cancelled) setStatus(value) }).catch(() => {})
      electronAPI.getSemanticStatus?.(directory || undefined).then((value) => { if (!cancelled) setMeaning(value) }).catch(() => {})
    }
    load()
    // Subito dopo l'apertura la prima scansione è ancora in corso: il conteggio si aggiorna da solo.
    const timer = setInterval(load, 4000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [directory, saved])

  async function rebuild() {
    setBusy(true)
    setMessage('')
    try {
      setStatus(await electronAPI.rebuildKnowledge(directory || undefined))
      setMessage(t('Index rebuilt'))
    } catch (reason) {
      onError(reason.message)
    } finally {
      setBusy(false)
    }
  }

  let summary = ''
  if (status && !status.available) summary = t('The search index is not available on this system')
  else if (status && !status.enabled) summary = t('The index is turned off for this project')
  else if (status && !status.files) summary = t('Nothing indexed yet')
  else if (status) summary = t('{files} documents, {chunks} passages, updated {date}', { files: formatNumber(status.files), chunks: formatNumber(status.chunks), date: status.updatedAt ? new Date(status.updatedAt).toLocaleString() : '-' })

  return (
    <div className="grid gap-2 rounded-lg border border-slate-800 p-3 text-sm text-slate-300">
      <label className="flex items-start gap-3">
        <Switch checked={enabled} onChange={(value) => onToggle(value)} />
        <span>{t('Search index for the assistant')}<span className="block text-xs text-slate-500">{t('Lets the assistant and agents search the documents. It is a copy of the files, rebuilt whenever needed.')}</span>
        </span>
      </label>
      {summary && <span className="text-xs text-slate-400">{summary}</span>}
      {enabled && (
        <label className="flex items-start gap-3 border-t border-slate-800 pt-2">
          <Switch checked={shared} onChange={(value) => onToggleShared(value)} />
          <span>{t('Share with the other projects')}<span className="block text-xs text-slate-500">{t('Shares the information of this project globally. Exclude it from sharing for relevance or confidentiality.')}</span>
          </span>
        </label>
      )}
      {enabled && <SemanticStatus status={meaning} />}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy || !status?.available || !saved} className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-slate-600 disabled:opacity-50" onClick={rebuild}>{busy ? t('Rebuilding…') : t('Rebuild the index')}</button>
        {(enabled !== saved || shared !== savedShared) && <span className="text-xs text-slate-500">{t('Save the settings to apply the change.')}</span>}
        {message && <span className="text-xs text-emerald-400">{message}</span>}
      </div>
    </div>
  )
}

// Ricerca per significato: non si decide qui ma in Impostazioni → Modelli locali (un modello, un dispositivo, valgono per tutti i progetti). Qui si vede solo come
// sta andando per questo progetto: ogni progetto con l'indice acceso ha i suoi vettori.
function SemanticStatus({ status }) {
  if (!status) return null
  let line
  if (status.allowed === false) line = <span className="text-amber-400">{t('Turned off in Settings → Local models.')}</span>
  else if (!status.activeDevice) line = <span className="text-slate-400">{t('Search by meaning: model not installed (Settings → Local models).')}</span>
  else {
    const progress = status.progress
    line = (
      <span className="text-slate-400">
        {t('Search by meaning: active ({device})', { device: status.activeDevice === 'gpu' ? t('Graphics card') : 'CPU' })}
        {progress && !progress.error ? ` · ${t('Passages understood: {done} of {total}', { done: formatNumber(progress.embedded), total: formatNumber(progress.total) })}` : ''}
        {status.gpu?.failure ? <span className="block text-rose-400">{t('Graphics card failed ({error}): the CPU is in use.', { error: status.gpu.failure })}</span> : null}
      </span>
    )
  }
  return <div className="border-t border-slate-800 pt-2 text-xs">{line}</div>
}

// Esporta la configurazione del progetto (contesto, skill, impostazioni) in un file e la importa da uno: per passare ad altri un modo standard di lavorare.
// L'importazione segue la copia del contesto: il contesto sostituisce o si aggiunge, i file e le skill già presenti restano (a meno di "sostituisci").
function ShareSetup({ target, onImported }) {
  const [directory, setDirectory] = useState(target)
  const [pending, setPending] = useState(null)
  const [mode, setMode] = useState('replace')
  const [overwrite, setOverwrite] = useState(false)
  const [applySettings, setApplySettings] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (target) setDirectory(target)
    else electronAPI.getProject().then(setDirectory).catch(() => {})
  }, [target])

  async function run(action) {
    setBusy(true)
    setMessage('')
    setError('')
    try { await action() } catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }

  const exportSetup = () => run(async () => {
    const result = await electronAPI.exportProjectSetup(directory)
    if (result) setMessage(t('Setup exported: {name}', { name: result.path.split(/[\\/]/).pop() }))
  })

  const chooseSetup = () => run(async () => {
    const chosen = await electronAPI.chooseProjectSetup()
    if (chosen) setPending(chosen)
  })

  const applySetup = () => run(async () => {
    const result = await electronAPI.applyProjectSetup({ id: pending.id, directory, mode, overwrite, applySettings })
    setPending(null)
    setMessage(t('Setup imported: {written} files written, {skipped} left as they were', { written: result.written, skipped: result.skipped }))
    onImported?.()
  })

  if (!directory) return null

  return (
    <div className="grid gap-2 rounded-lg border border-slate-800 p-3 text-sm text-slate-300">
      <span>{t('Share the project setup')}</span>
      <span className="text-xs text-slate-500">{t('Exports the context, the other instruction files, the project skills and the settings (languages, spell checker, editor font, default skills) to a single file you can give to others. History, conversations, notes, memory, links and references are never included.')}</span>
      {!pending && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy} className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-slate-600 disabled:opacity-50" onClick={exportSetup}>{t('Export setup…')}</button>
          <button type="button" disabled={busy} className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-slate-600 disabled:opacity-50" onClick={chooseSetup}>{t('Import setup…')}</button>
        </div>
      )}
      {pending && (
        <div className="grid gap-2 rounded-md border border-slate-700 bg-slate-900/60 p-3">
          <span className="text-xs text-slate-400">{pending.fileName}{pending.app ? ` · ${pending.app}` : ''}</span>
          <ul className="list-disc pl-5 text-xs text-slate-400">
            <li>{t('Context: {count} characters', { count: pending.contextCharacters })}</li>
            <li>{t('Instruction files: {names}', { names: pending.instructionFiles.join(', ') || t('None') })}</li>
            <li>{t('Skills: {names}', { names: pending.skills.join(', ') || t('None') })}</li>
          </ul>
          <div className="flex flex-wrap gap-4 text-xs text-slate-400">
            <label className="flex items-center gap-1.5"><input type="radio" name="setup-mode" className="accent-accent-500" checked={mode === 'replace'} onChange={() => setMode('replace')} /> {t('Replace the current context')}</label>
            <label className="flex items-center gap-1.5"><input type="radio" name="setup-mode" className="accent-accent-500" checked={mode === 'append'} onChange={() => setMode('append')} /> {t('Add after the current context')}</label>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-400"><Switch checked={applySettings} onChange={(value) => setApplySettings(value)} className="!mt-0" /> {t('Also apply the settings (languages, spell checker, editor font, default skills)')}</label>
          <label className="flex items-center gap-1.5 text-xs text-slate-400"><Switch checked={overwrite} onChange={(value) => setOverwrite(value)} className="!mt-0" /> {t('Replace instruction files and skills that already exist')}</label>
          <div className="flex items-center gap-3">
            <button type="button" disabled={busy} className="rounded-md bg-accent-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-accent-500 disabled:opacity-50" onClick={applySetup}>{t('Import')}</button>
            <button type="button" disabled={busy} className="rounded-md px-3 py-1.5 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-50" onClick={() => setPending(null)}>{t('Cancel')}</button>
          </div>
        </div>
      )}
      {message && <span className="text-xs text-emerald-400">{message}</span>}
      {error && <span className="text-xs text-rose-400">{error}</span>}
    </div>
  )
}

// Copia il contesto per l'assistente da un altro progetto dell'elenco a questo.
function CopyContext({ target, onCopied }) {
  const [projects, setProjects] = useState([])
  const [current, setCurrent] = useState(null)
  const [from, setFrom] = useState('')
  const [mode, setMode] = useState('replace')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([electronAPI.listProjects(), electronAPI.getProject()]).then(([list, open]) => { setProjects(list.filter((item) => !item.missing)); setCurrent(target || open) }).catch(() => {})
  }, [target])

  const sources = projects.filter((item) => current && !samePath(item.path, current))

  async function copy() {
    setMessage('')
    setError('')
    try {
      const result = await electronAPI.copyProjectContext({ from, to: current, mode })
      setMessage(t('Context copied ({count} characters)', { count: result.characters }))
      onCopied?.()
    } catch (reason) {
      setError(reason.message)
    }
  }

  if (!sources.length) return null

  return (
    <div className="grid gap-2 rounded-lg border border-slate-800 p-3 text-sm text-slate-300">
      <span>{t('Copy the context from another project')}</span>
      <select className={fieldClass.replace('mt-2 ', '')} value={from} onChange={(event) => { setFrom(event.target.value); setMessage('') }}>
        <option value="">{t('Choose a project…')}</option>
        {sources.map((item) => <option key={item.path} value={item.path}>{item.name}</option>)}
      </select>
      <div className="flex flex-wrap gap-4 text-xs text-slate-400">
        <label className="flex items-center gap-1.5"><input type="radio" name="copy-mode" className="accent-accent-500" checked={mode === 'replace'} onChange={() => setMode('replace')} /> {t('Replace the current context')}</label>
        <label className="flex items-center gap-1.5"><input type="radio" name="copy-mode" className="accent-accent-500" checked={mode === 'append'} onChange={() => setMode('append')} /> {t('Add after the current context')}</label>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" disabled={!from} className="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-slate-600 disabled:opacity-50" onClick={copy}>{t('Copy context')}</button>
        {message && <span className="text-xs text-emerald-400">{message}</span>}
        {error && <span className="text-xs text-rose-400">{error}</span>}
      </div>
      <span className="text-xs text-slate-500">{t('Copies context.md, the other instruction files and the skills of .ow that do not exist yet in this project.')}</span>
    </div>
  )
}
