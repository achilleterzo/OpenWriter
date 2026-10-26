import { useEffect, useMemo, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { t } from '../i18n/index.js'

const electronAPI = window.electronAPI

const TOOL_NAMES = 'project_info, read_project, get_context, list_skills, get_skill, list_documents, read_document, search_files, list_notes, list_bookmarks, list_memory'
const READ_EDITOR_TOOL = 'read_open_document'
const WRITE_TOOL_NAMES = 'open_document, open_project, ask_agent, add_note, suggest_insertion, update_note, add_bookmark, update_bookmark, create_file, create_folder, replace_text, insert_text, replace_document'
const EDIT_PREFERENCE = 'openwriter.mcpEdit'
const HTTP_READ_ONLY_PREFERENCE = 'openwriter.mcpHttpReadOnly'

// Virgolette per una riga di comando: i percorsi con spazi vanno racchiusi.
const shell = (value) => (/[\s"\\]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value)

// Configurazione da incollare nel client scelto: comando e argomenti sono quelli di questa installazione.
function snippets({ command, args, env, platform }) {
  const envEntries = Object.entries(env || {})
  const json = (value) => JSON.stringify(value, null, 2)
  return [
    {
      id: 'claude-code',
      label: 'Claude Code',
      where: platform === 'win32' ? t('Run in a terminal (if you installed Claude Code with npm and PowerShell does not pass the options, use claude.cmd instead of claude):') : t('Run in a terminal:'),
      // `--scope user`: senza, Claude Code registra il server solo per la cartella in cui si lancia il comando (scope "local") e altrove non compare.
      // `--env` accetta più valori e inghiottirebbe il nome: va dopo il nome e prima di `--`. Con l'installazione nativa `claude` è un eseguibile (claude.exe) e funziona in ogni shell; con npm, in PowerShell,
      // è uno script (claude.ps1) che perde il `--` e fa scambiare i flag del server (es. --data) per opzioni sue: lì serve `claude.cmd`, che non esiste con l'installazione nativa.
      text: ['claude', 'mcp add --scope user --transport stdio openwriter', ...envEntries.map(([key, value]) => `--env ${key}=${value}`), '--', shell(command), ...args.map(shell)].join(' '),
    },
    {
      id: 'codex',
      label: 'Codex',
      where: t('Add to {file}:', { file: '~/.codex/config.toml' }),
      text: [
        '[mcp_servers.openwriter]',
        `command = ${JSON.stringify(command)}`,
        `args = ${JSON.stringify(args)}`,
        ...(envEntries.length ? [`env = { ${envEntries.map(([key, value]) => `${key} = ${JSON.stringify(value)}`).join(', ')} }`] : []),
      ].join('\n'),
    },
    {
      id: 'opencode',
      label: 'OpenCode',
      where: t('Add to {file}:', { file: 'opencode.json' }),
      text: json({ $schema: 'https://opencode.ai/config.json', mcp: { openwriter: { type: 'local', command: [command, ...args], ...(envEntries.length ? { environment: env } : {}), enabled: true } } }),
    },
    {
      id: 'json',
      label: t('Other clients (JSON)'),
      where: t('The usual "mcpServers" format (Claude Desktop, Cursor, Windsurf…). VS Code and PhpStorm use the same fields under "servers" in .vscode/mcp.json or in the MCP settings.'),
      text: json({ mcpServers: { openwriter: { command, args, ...(envEntries.length ? { env } : {}) } } }),
    },
  ]
}

/** Server MCP di OpenWriter: spiega cosa offre e dà la configurazione da copiare nel client dell'agente. */
// Server MCP via HTTP, per i client che non possono avviare un processo: solo su questo computer (127.0.0.1), protetto da un token.
function HttpServer() {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [readOnly, setReadOnly] = useState(() => electronAPI.preferences?.values?.[HTTP_READ_ONLY_PREFERENCE] === 'on')
  const [copied, setCopied] = useState('')
  const [showToken, setShowToken] = useState(false)

  useEffect(() => {
    let cancelled = false
    electronAPI.getMcpHttp().then((value) => { if (!cancelled) setStatus(value) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  async function apply(request) {
    setBusy(true)
    try { setStatus(await electronAPI.setMcpHttp(request)) } catch (reason) { setStatus((current) => ({ ...current, running: false, error: reason.message })) } finally { setBusy(false) }
  }

  function changeReadOnly(value) {
    setReadOnly(value)
    electronAPI.preferences?.set(HTTP_READ_ONLY_PREFERENCE, value ? 'on' : 'off')
    if (status?.running) apply({ enabled: true })
  }

  async function copy(id, value) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(id)
      setTimeout(() => setCopied(''), 1500)
    } catch { /* senza appunti si può selezionare il testo a mano */ }
  }

  const snippets = status?.url ? [
    { id: 'claude', label: 'Claude Code', text: `claude mcp add --scope user --transport http openwriter ${status.url} --header "Authorization: Bearer ${status.token}"` },
    { id: 'json', label: t('Other clients (JSON)'), text: JSON.stringify({ mcpServers: { openwriter: { type: 'http', url: status.url, headers: { Authorization: `Bearer ${status.token}` } } } }, null, 2) },
  ] : []

  return (
    <section className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
      <h2 className="text-lg font-semibold">{t('HTTP server')}</h2>
      <p className="max-w-2xl text-sm leading-6 text-slate-400">{t('For agents that cannot start a program. The server listens only on this computer (127.0.0.1) and every request needs the token below. It works while OpenWriter is running.')}</p>
      <label className="flex items-start gap-2 text-sm text-slate-300">
        <input type="checkbox" className="mt-1" disabled={busy || !status} checked={Boolean(status?.running)} onChange={(event) => apply({ enabled: event.target.checked })} />
        <span>{t('Turn on the HTTP server')}</span>
      </label>
      <label className="flex items-start gap-2 text-sm text-slate-300">
        <input type="checkbox" className="mt-1" checked={readOnly} onChange={(event) => changeReadOnly(event.target.checked)} />
        <span>{t('Read-only: the agent cannot add notes, suggestions or bookmarks')}</span>
      </label>
      {status?.error && <p className="text-sm text-red-400">{status.error}</p>}
      {status?.running && (
        <>
          <p className="break-all font-mono text-xs text-slate-300">{status.url}</p>
          <p className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="break-all font-mono">{showToken ? status.token : '•'.repeat(24)}</span>
            <button type="button" className="rounded px-2 py-0.5 hover:bg-slate-800" onClick={() => setShowToken((value) => !value)}>{showToken ? t('Hide') : t('Show')}</button>
            <button type="button" className="rounded px-2 py-0.5 hover:bg-slate-800 disabled:opacity-50" disabled={busy} onClick={() => apply({ enabled: true, renewToken: true })}>{t('New token')}</button>
          </p>
          {snippets.map((item) => (
            <div key={item.id} className="grid gap-1">
              <p className="text-sm text-slate-400">{item.label}</p>
              <div className="relative">
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-slate-800 bg-slate-950 p-3 pr-12 font-mono text-xs leading-5 text-slate-200">{showToken ? item.text : item.text.split(status.token).join('•'.repeat(12))}</pre>
                <button type="button" aria-label={copied === item.id ? t('Copied') : t('Copy')} title={copied === item.id ? t('Copied') : t('Copy')} className="absolute right-2 top-2 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-50" onClick={() => copy(item.id, item.text)}>
                  {copied === item.id ? <Check size={15} /> : <Copy size={15} />}
                </button>
              </div>
            </div>
          ))}
          <p className="text-xs text-slate-500">{t('The server follows the project open in OpenWriter. Anyone with the token can read your documents: do not share it.')}</p>
        </>
      )}
    </section>
  )
}

export default function McpSettings({ project }) {
  const [config, setConfig] = useState(null)
  const [pinProject, setPinProject] = useState(false)
  const [readOnly, setReadOnly] = useState(false)
  // Modifiche degli agenti ai documenti aperti: attive salvo scelta contraria (preferenza dell'app, valida subito, senza rigenerare la configurazione).
  const [allowEdits, setAllowEdits] = useState(() => electronAPI.preferences?.values?.[EDIT_PREFERENCE] !== 'off')
  const changeAllowEdits = (value) => { setAllowEdits(value); electronAPI.preferences?.set(EDIT_PREFERENCE, value ? 'on' : 'off') }
  const [clientId, setClientId] = useState('claude-code')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    electronAPI.getMcpConfig().then((value) => { if (!cancelled) setConfig(value) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const options = useMemo(() => (config ? snippets({ ...config, args: [...config.args, ...(pinProject && project ? ['--project', project] : []), ...(readOnly ? ['--read-only'] : [])] }) : []), [config, pinProject, project, readOnly])
  const current = options.find((item) => item.id === clientId) || options[0]

  async function copy() {
    try {
      await navigator.clipboard.writeText(current.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* senza appunti si può selezionare il testo a mano */ }
  }

  return (
    <div className="grid gap-6">
      <section className="grid grid-cols-1 gap-4 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
        <h2 className="text-lg font-semibold">{t('Agents (MCP)')}</h2>
        <p className="max-w-2xl text-sm leading-6 text-slate-400">{t('OpenWriter can act as an MCP server: agents such as Claude Code, Codex or OpenCode, or the clients built into your IDE, can read the context and instructions of the project, its skills, notes, bookmarks and memory, and search and read its documents. They never write to the files: they can add notes, suggested changes and bookmarks, and edit the documents open in OpenWriter, with the changes marked for you to accept or reject one by one.')}</p>
        <p className="max-w-2xl text-sm leading-6 text-slate-400">{t('The project is the one of the folder where the agent starts, if it contains a .ow folder; otherwise the one open in OpenWriter.')}</p>
        <p className="max-w-2xl break-words font-mono text-xs leading-5 text-slate-500">{TOOL_NAMES}, {READ_EDITOR_TOOL}<br />{WRITE_TOOL_NAMES}</p>
      </section>

      <section className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
        <h2 className="text-lg font-semibold">{t('Agent edits')}</h2>
        <label className="flex items-start gap-2 text-sm text-slate-300">
          <input type="checkbox" className="mt-1" checked={allowEdits} onChange={(event) => changeAllowEdits(event.target.checked)} />
          <span>{t('Let agents change the documents open in OpenWriter (the changes stay marked for you to accept or reject)')}</span>
        </label>
      </section>

      <section className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
        <h2 className="text-lg font-semibold">{t('Add the server to your client')}</h2>
        <label className="flex items-start gap-2 text-sm text-slate-300">
          <input type="checkbox" className="mt-1" checked={readOnly} onChange={(event) => setReadOnly(event.target.checked)} />
          <span>{t('Read-only: the agent cannot add notes, suggestions or bookmarks')}</span>
        </label>
        {project && (
          <label className="flex items-start gap-2 text-sm text-slate-300">
            <input type="checkbox" className="mt-1" checked={pinProject} onChange={(event) => setPinProject(event.target.checked)} />
            <span>{t('Always use this project, whatever the folder the agent starts in')}<span className="block break-all text-xs text-slate-500">{project}</span></span>
          </label>
        )}
        {!config ? <p className="text-sm text-slate-500">…</p> : (
          <>
            <div role="tablist" aria-label={t('Client')} className="flex flex-wrap gap-1">
              {options.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={current.id === item.id}
                  className={`rounded-md px-3 py-1.5 text-sm transition ${current.id === item.id ? 'bg-accent-500/15 font-medium text-accent-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-50'}`}
                  onClick={() => setClientId(item.id)}
                >{item.label}</button>
              ))}
            </div>
            <p className="text-sm text-slate-400">{current.where}</p>
            <div className="relative">
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-slate-800 bg-slate-950 p-3 pr-12 font-mono text-xs leading-5 text-slate-200">{current.text}</pre>
              <button type="button" aria-label={copied ? t('Copied') : t('Copy')} title={copied ? t('Copied') : t('Copy')} className="absolute right-2 top-2 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-50" onClick={copy}>
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </button>
            </div>
            {!config.packaged && <p className="text-xs text-slate-500">{t('Development build: the command uses Node.js from the PATH.')}</p>}
          </>
        )}
      </section>

      <HttpServer />
    </div>
  )
}
