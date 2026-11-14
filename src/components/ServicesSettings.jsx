import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Pencil, Play, Plus, ShieldCheck, Trash2, X } from 'lucide-react'
import Switch from './Switch.jsx'
import { t } from '../i18n/index.js'

const electronAPI = window.electronAPI

const field = 'w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent-500'
const smallButton = 'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-slate-300 transition hover:bg-slate-800 hover:text-slate-50 disabled:opacity-50'

// Righe nome/valore per le credenziali. Un valore già salvato non si rimostra: lasciarlo vuoto lo conserva.
const toRows = (names) => (names || []).map((name) => ({ name, value: '', saved: true }))

function ServerForm({ server, directory, secureStorage, onCancel, onSaved }) {
  const [name, setName] = useState(server?.name || '')
  const [type, setType] = useState(server?.type || 'stdio')
  const [command, setCommand] = useState(server?.command || '')
  const [args, setArgs] = useState((server?.args || []).join('\n'))
  const [url, setUrl] = useState(server?.url || '')
  const [alwaysAsk, setAlwaysAsk] = useState(server?.alwaysAsk === true)
  const [env, setEnv] = useState(toRows(server?.envNames))
  const [headers, setHeaders] = useState(toRows(server?.headerNames))
  const [auth, setAuth] = useState(server?.auth === 'oauth' ? 'oauth' : 'headers')
  const [clientId, setClientId] = useState(server?.clientId || '')
  const [clientSecret, setClientSecret] = useState('')
  const [scopes, setScopes] = useState((server?.scopes || []).join('\n'))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const rows = type === 'stdio' ? env : headers
  const setRows = type === 'stdio' ? setEnv : setHeaders
  const update = (index, patch) => setRows(rows.map((row, position) => (position === index ? { ...row, ...patch } : row)))

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const used = rows.filter((row) => row.name.trim())
      const credentials = Object.fromEntries(used.filter((row) => row.value !== '').map((row) => [row.name.trim(), row.value]))
      const saved = await electronAPI.mcp.saveServer({
        directory,
        server: {
          id: server?.id,
          name,
          type,
          command,
          args: args.split('\n').map((line) => line.trim()).filter(Boolean),
          url,
          alwaysAsk,
          enabledTools: server?.enabledTools || [],
          envNames: type === 'stdio' ? used.map((row) => row.name.trim()) : [],
          headerNames: type === 'http' && auth === 'headers' ? used.map((row) => row.name.trim()) : [],
          auth: type === 'http' && auth === 'oauth' ? 'oauth' : 'none',
          clientId,
          scopes: scopes.split('\n').map((line) => line.trim()).filter(Boolean),
        },
        credentials: type === 'stdio' ? { env: credentials } : auth === 'oauth' ? { oauth: { clientSecret } } : { headers: credentials },
      })
      onSaved(saved)
    } catch (reason) {
      setError(reason.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="grid gap-3 rounded-lg border border-slate-700 bg-slate-950/60 p-4" onSubmit={save}>
      <label className="grid gap-1 text-sm text-slate-300">{t('Name')}
        <input className={field} value={name} maxLength={60} required onChange={(event) => setName(event.target.value)} />
      </label>
      <div role="radiogroup" aria-label={t('Type')} className="flex flex-wrap gap-4 text-sm text-slate-300">
        {[['stdio', t('Program on this computer')], ['http', t('Web address')]].map(([value, label]) => (
          <label key={value} className="flex items-center gap-2"><input type="radio" name="service-type" checked={type === value} onChange={() => setType(value)} /> {label}</label>
        ))}
      </div>
      {type === 'stdio' ? (
        <>
          <label className="grid gap-1 text-sm text-slate-300">{t('Command')}
            <input className={`${field} font-mono`} value={command} required placeholder="npx" onChange={(event) => setCommand(event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm text-slate-300">{t('Arguments, one per line')}
            <textarea className={`${field} font-mono`} rows={3} value={args} placeholder={'-y\n@scope/server'} onChange={(event) => setArgs(event.target.value)} />
          </label>
          <p className="flex items-start gap-2 text-xs leading-5 text-amber-300"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {t('A program runs with your permissions: add only services you trust.')}</p>
        </>
      ) : (
        <label className="grid gap-1 text-sm text-slate-300">{t('Address')}
          <input className={`${field} font-mono`} value={url} required type="url" placeholder="https://example.com/mcp" onChange={(event) => setUrl(event.target.value)} />
        </label>
      )}
      {type === 'http' && (
        <div role="radiogroup" aria-label={t('Access')} className="flex flex-wrap gap-4 text-sm text-slate-300">
          {[['headers', t('Fixed headers (a token or a key)')], ['oauth', t('OAuth sign-in')]].map(([value, label]) => (
            <label key={value} className="flex items-center gap-2"><input type="radio" name="service-auth" checked={auth === value} onChange={() => setAuth(value)} /> {label}</label>
          ))}
        </div>
      )}
      {type === 'http' && auth === 'oauth' && (
        <div className="grid gap-3">
          <p className="text-xs leading-5 text-slate-500">{t('Create an OAuth client of type “Desktop app” with the service provider (for Google, in the Cloud console, enabling the APIs of the service) and paste its ID and secret here: the service does not register clients by itself. Then use “Sign in” on the service card.')}</p>
          <label className="grid gap-1 text-sm text-slate-300">{t('Client ID')}
            <input className={`${field} font-mono`} value={clientId} required autoComplete="off" onChange={(event) => setClientId(event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm text-slate-300">{t('Client secret')}
            <input className={`${field} font-mono`} type="password" autoComplete="off" value={clientSecret} placeholder={server?.hasClientSecret ? t('Saved: leave empty to keep it') : ''} disabled={!secureStorage} onChange={(event) => setClientSecret(event.target.value)} />
          </label>
          <label className="grid gap-1 text-sm text-slate-300">{t('Scopes, one per line')}
            <textarea className={`${field} font-mono`} rows={3} value={scopes} placeholder="https://www.googleapis.com/auth/documents.readonly" onChange={(event) => setScopes(event.target.value)} />
          </label>
          <p className="text-xs leading-5 text-slate-500">{t('Start with read-only scopes: what you grant here is what the service can do for the assistant.')}</p>
        </div>
      )}
      {!(type === 'http' && auth === 'oauth') && <fieldset className="grid gap-2">
        <legend className="text-sm text-slate-300">{type === 'stdio' ? t('Environment variables') : t('Headers')}</legend>
        <p className="text-xs leading-5 text-slate-500">{secureStorage ? t('Values are stored encrypted on this computer, never in the project.') : t('Secure credential storage is not available on this system')}</p>
        {rows.map((row, index) => (
          <div key={index} className="flex gap-2">
            <input className={`${field} font-mono sm:w-1/3`} aria-label={t('Name')} value={row.name} placeholder={type === 'stdio' ? 'API_TOKEN' : 'Authorization'} onChange={(event) => update(index, { name: event.target.value })} />
            <input className={`${field} font-mono`} aria-label={t('Value')} type="password" autoComplete="off" value={row.value} placeholder={row.saved ? t('Saved: leave empty to keep it') : t('Value')} onChange={(event) => update(index, { value: event.target.value })} />
            <button type="button" aria-label={t('Remove')} title={t('Remove')} className="rounded-md p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-50" onClick={() => setRows(rows.filter((_, position) => position !== index))}><X size={15} /></button>
          </div>
        ))}
        <div><button type="button" className={smallButton} disabled={!secureStorage} onClick={() => setRows([...rows, { name: '', value: '', saved: false }])}><Plus size={14} /> {t('Add')}</button></div>
      </fieldset>}
      <label className="flex items-start gap-2 text-sm text-slate-300">
        <Switch checked={alwaysAsk} onChange={setAlwaysAsk} />
        <span>{t('Ask before every call, even for tools that only read')}</span>
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className={smallButton} onClick={onCancel}>{t('Cancel')}</button>
        <button type="submit" disabled={busy} className="rounded-md bg-accent-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-accent-500 disabled:opacity-50">{t('Save')}</button>
      </div>
    </form>
  )
}

// Gli strumenti del servizio: l'utente accende solo quelli che vuole offrire all'assistente (all'inizio nessuno).
function ToolList({ server, directory, tools, onChanged }) {
  const enabled = new Set(server.enabledTools)
  async function toggle(name, on) {
    const next = on ? [...enabled, name] : [...enabled].filter((item) => item !== name)
    await electronAPI.mcp.saveServer({ directory, server: { ...server, enabledTools: next } })
    onChanged()
  }
  if (!tools.length) return <p className="text-sm text-slate-400">{t('This service offers no tools.')}</p>
  return (
    <ul className="grid gap-2">
      {tools.map((tool) => (
        <li key={tool.name} className="flex items-start gap-3 text-sm">
          <Switch checked={enabled.has(tool.name)} onChange={(value) => toggle(tool.name, value)} label={tool.name} />
          <span className="min-w-0">
            <span className="font-mono text-slate-200">{tool.name}</span>
            <span className={`ml-2 rounded px-1.5 py-0.5 text-[11px] ${tool.readOnly ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}`}>{tool.readOnly ? t('only reads') : t('may change things: asks first')}</span>
            {tool.description && <span className="mt-0.5 block text-xs leading-5 text-slate-400">{tool.description}</span>}
          </span>
        </li>
      ))}
    </ul>
  )
}

function ServerCard({ server, directory, secureStorage, used, onUse, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [tools, setTools] = useState(null)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [signing, setSigning] = useState(false)
  const editable = server.scope === 'global' ? !directory : !server.inherited
  const target = server.scope === 'project' ? directory : null

  async function test() {
    setTesting(true)
    setError('')
    try { setTools(await electronAPI.mcp.testServer(directory || null, server.id)) } catch (reason) { setTools(null); setError(reason.message) } finally { setTesting(false) }
  }
  async function trust() {
    try { await electronAPI.mcp.trustServer(directory, server.id); onChanged() } catch (reason) { setError(reason.message) }
  }
  async function signIn() {
    setSigning(true)
    setError('')
    try { await electronAPI.mcp.signIn(directory || null, server.id); onChanged() } catch (reason) { setError(reason.message) } finally { setSigning(false) }
  }
  async function signOut() {
    try { await electronAPI.mcp.signOut(directory || null, server.id); setTools(null); onChanged() } catch (reason) { setError(reason.message) }
  }
  async function remove() {
    if (!window.confirm(t('Remove the service “{name}”?', { name: server.name }))) return
    try { await electronAPI.mcp.removeServer({ directory: target, id: server.id }); onChanged() } catch (reason) { setError(reason.message) }
  }

  if (editing) return <ServerForm server={server} directory={target} secureStorage={secureStorage} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); setTools(null); onChanged() }} />
  const untrusted = server.scope === 'project' && !server.trusted
  return (
    <div className="grid gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-4">
      <div className="flex flex-wrap items-start gap-3">
        {onUse && <Switch checked={used} onChange={onUse} label={t('Use in this project')} />}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-100">{server.name} <span className="ml-1 text-xs font-normal text-slate-500">{server.type === 'stdio' ? t('program') : t('web address')}{server.inherited ? ` · ${t('from a parent project')}` : ''}</span></p>
          <p className="break-all font-mono text-xs text-slate-400">{server.type === 'stdio' ? [server.command, ...server.args].join(' ') : server.url}</p>
          <p className="mt-1 text-xs text-slate-500">{server.enabledTools.length ? t('{count} tools on', { count: server.enabledTools.length }) : t('No tool is on yet: test the service and switch some on.')}{server.missingCredentials ? ` · ${t('credentials missing on this computer')}` : ''}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!untrusted && (server.auth !== 'oauth' || server.signedIn) && <button type="button" className={smallButton} disabled={testing} onClick={test}><Play size={13} /> {testing ? t('Testing…') : t('Test')}</button>}
          {editable && <button type="button" className={smallButton} onClick={() => setEditing(true)}><Pencil size={13} /> {t('Edit')}</button>}
          {editable && <button type="button" aria-label={t('Remove')} title={t('Remove')} className={smallButton} onClick={remove}><Trash2 size={13} /></button>}
        </div>
      </div>
      {server.auth === 'oauth' && !untrusted && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-300">
          <span>{server.signedIn ? t('Signed in') : t('Not signed in')}</span>
          <button type="button" className={smallButton} disabled={signing || !server.clientId || !server.hasClientSecret} title={!server.hasClientSecret ? t('Edit the service and give the client ID and secret first') : undefined} onClick={signIn}>{signing ? t('Waiting for the browser…') : server.signedIn ? t('Sign in again') : t('Sign in')}</button>
          {server.signedIn && <button type="button" className={smallButton} onClick={signOut}>{t('Sign out')}</button>}
        </div>
      )}
      {untrusted && (
        <div className="grid gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
          <p className="flex items-start gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> {server.type === 'stdio' ? t('This project asks to run this program on your computer, with your permissions. Check the command above before confirming. It will not start until you do, and you will be asked again if it changes.') : t('This project asks to connect to this address. Check it before confirming. It will not be used until you do, and you will be asked again if it changes.')}</p>
          <div><button type="button" className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-amber-400" onClick={trust}><ShieldCheck size={14} /> {t('I trust it: allow')}</button></div>
        </div>
      )}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {tools && <ToolList server={server} directory={target} tools={tools} onChanged={onChanged} />}
    </div>
  )
}

/**
 * I servizi esterni (server MCP) che l'assistente può usare. Senza `project` sono le impostazioni generali (i servizi del computer);
 * con `project` (la cartella) sono quelle del progetto: quali servizi generali usa e quelli che definisce da sé. Ogni modifica si salva subito:
 * le credenziali stanno cifrate sul computer, la configurazione del progetto nella sua cartella `.ow`.
 */
export default function ServicesSettings({ project }) {
  const [data, setData] = useState(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(() => { electronAPI.mcp.list(project || undefined).then(setData).catch((reason) => setError(reason.message)) }, [project])
  useEffect(() => { load() }, [load])

  if (!data) return <p className="text-sm text-slate-400">{error || t('Loading…')}</p>
  const used = new Set(data.use)
  async function toggleUse(id, on) {
    const next = on ? [...used, id] : [...used].filter((item) => item !== id)
    try { await electronAPI.mcp.setUse(project, next); load() } catch (reason) { setError(reason.message) }
  }
  const finish = () => { setAdding(false); load() }

  return (
    <div className="grid grid-cols-1 gap-6">
      <section className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
        <p className="max-w-2xl text-sm leading-6 text-slate-400">{project
          ? t('Services are external programs or sites (MCP servers) whose tools the assistant can use, for example to work on documents that live in the cloud. Choose which of the services of this computer this project uses, and add the ones that belong to this project only.')
          : t('Services are external programs or sites (MCP servers) whose tools the assistant can use, for example to work on documents that live in the cloud. Add them here; each project chooses which ones to use. The assistant sees only the tools you switch on, and asks you before a tool that may change something.')}</p>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </section>

      {project && (
        <section className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
          <h2 className="text-lg font-semibold">{t('Services of this computer')}</h2>
          {data.global.length === 0 && <p className="text-sm text-slate-400">{t('There are none yet: add them in the general settings, “Services”.')}</p>}
          {data.global.map((server) => <ServerCard key={server.id} server={server} directory={project} secureStorage={data.secureStorage} used={used.has(server.id)} onUse={(on) => toggleUse(server.id, on)} onChanged={load} />)}
        </section>
      )}

      <section className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
        <h2 className="text-lg font-semibold">{project ? t('Services of this project') : t('Services')}</h2>
        {(project ? data.project : data.global).map((server) => <ServerCard key={server.id} server={server} directory={project} secureStorage={data.secureStorage} onChanged={load} />)}
        {!(project ? data.project : data.global).length && !adding && <p className="text-sm text-slate-400">{t('No services yet.')}</p>}
        {adding
          ? <ServerForm directory={project || null} secureStorage={data.secureStorage} onCancel={() => setAdding(false)} onSaved={finish} />
          : <div><button type="button" className="inline-flex items-center gap-2 rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 transition hover:bg-slate-800" onClick={() => setAdding(true)}><Plus size={15} /> {t('Add a service')}</button></div>}
      </section>
    </div>
  )
}
