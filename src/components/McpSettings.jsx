import { useEffect, useMemo, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { t } from '../i18n/index.js'

const electronAPI = window.electronAPI

const TOOL_NAMES = 'project_info, get_context, list_skills, get_skill, list_documents, read_document, search_documents, list_notes, list_bookmarks, list_memory'

// Virgolette per una riga di comando: i percorsi con spazi vanno racchiusi.
const shell = (value) => (/[\s"\\]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value)

// Configurazione da incollare nel client scelto: comando e argomenti sono quelli di questa installazione.
function snippets({ command, args, env }) {
  const envEntries = Object.entries(env || {})
  const json = (value) => JSON.stringify(value, null, 2)
  return [
    {
      id: 'claude-code',
      label: 'Claude Code',
      where: t('Run in a terminal:'),
      text: ['claude mcp add openwriter', ...envEntries.map(([key, value]) => `-e ${key}=${value}`), '--', shell(command), ...args.map(shell)].join(' '),
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
export default function McpSettings({ project }) {
  const [config, setConfig] = useState(null)
  const [pinProject, setPinProject] = useState(false)
  const [clientId, setClientId] = useState('claude-code')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    electronAPI.getMcpConfig().then((value) => { if (!cancelled) setConfig(value) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const options = useMemo(() => (config ? snippets({ ...config, args: pinProject && project ? [...config.args, '--project', project] : config.args }) : []), [config, pinProject, project])
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
        <p className="max-w-2xl text-sm leading-6 text-slate-400">{t('OpenWriter can act as an MCP server: agents such as Claude Code, Codex or OpenCode, or the clients built into your IDE, can read the context and instructions of the project, its skills, notes, bookmarks and memory, and search and read its documents. It is read-only: editing stays with the agent\'s own client.')}</p>
        <p className="max-w-2xl text-sm leading-6 text-slate-400">{t('The project is the one of the folder where the agent starts, if it contains a .ow folder; otherwise the one open in OpenWriter.')}</p>
        <p className="max-w-2xl break-words font-mono text-xs leading-5 text-slate-500">{TOOL_NAMES}</p>
      </section>

      <section className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
        <h2 className="text-lg font-semibold">{t('Add the server to your client')}</h2>
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
    </div>
  )
}
