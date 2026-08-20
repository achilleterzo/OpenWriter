import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, PlugZap, Settings2, XCircle } from 'lucide-react'

const electronAPI = window.electronAPI

const stateLabels = {
  disconnected: 'Non connesso',
  connecting: 'Connessione in corso',
  connected: 'Connesso',
  error: 'Errore',
}

export default function SettingsScreen({ onBack }) {
  const [executable, setExecutable] = useState('codex')
  const [status, setStatus] = useState({ state: 'disconnected' })
  const [logs, setLogs] = useState([])

  useEffect(() => {
    if (!electronAPI) return undefined
    electronAPI.getCodexStatus().then(setStatus)
    const removeStatusListener = electronAPI.onCodexStatus(setStatus)
    const removeLogListener = electronAPI.onCodexLog((message) => {
      setLogs((current) => [...current.slice(-199), message])
    })
    return () => {
      removeStatusListener()
      removeLogListener()
    }
  }, [])

  async function connect() {
    try {
      await electronAPI.connectCodex(executable.trim() || 'codex')
    } catch (error) {
      setStatus((current) => ({ ...current, state: 'error', error: error.message }))
    }
  }

  async function disconnect() {
    await electronAPI.disconnectCodex()
  }

  const connected = status.state === 'connected'
  const busy = status.state === 'connecting'

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-slate-950/75 p-4 text-slate-100 backdrop-blur-sm sm:p-8">
      <section role="dialog" aria-modal="true" aria-labelledby="settings-title" className="flex max-h-[min(760px,calc(100vh-2rem))] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <header className="flex items-center gap-4 border-b border-slate-800 px-6 py-5">
          <button
            type="button"
            aria-label="Torna al documento"
            title="Torna al documento"
            className="rounded-md p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            onClick={onBack}
          >
            <ArrowLeft size={19} />
          </button>
          <div>
            <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.25em] text-cyan-400">
              <Settings2 size={15} /> Impostazioni
            </p>
            <h1 id="settings-title" className="mt-1 text-2xl font-semibold tracking-tight">Configurazione</h1>
          </div>
        </header>

        <div className="overflow-y-auto p-6 sm:p-10">
          <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <PlugZap className="text-violet-400" size={20} />
                  <h2 className="text-lg font-semibold">Codex app-server</h2>
                </div>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
                  Connessione locale al protocollo JSON-RPC di Codex tramite stdio. Il server viene inizializzato con il client OpenWriter.
                </p>
              </div>
              <div className={`flex shrink-0 items-center gap-2 text-sm ${connected ? 'text-emerald-400' : status.state === 'error' ? 'text-rose-400' : 'text-slate-400'}`}>
                {connected ? <CheckCircle2 size={16} /> : status.state === 'error' ? <XCircle size={16} /> : <span className="h-2 w-2 rounded-full bg-current" />}
                {stateLabels[status.state] || status.state}
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex-1 text-sm text-slate-300">
                Comando Codex
                <input
                  value={executable}
                  disabled={busy || connected}
                  onChange={(event) => setExecutable(event.target.value)}
                  className="mt-2 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2.5 text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-400 disabled:opacity-60"
                  placeholder="codex"
                />
              </label>
              {connected ? (
                <button type="button" className="rounded-md bg-slate-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-600" onClick={disconnect}>
                  Disconnetti
                </button>
              ) : (
                <button type="button" disabled={busy} className="rounded-md bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-500 disabled:cursor-wait disabled:opacity-60" onClick={connect}>
                  {busy ? 'Connessione...' : 'Connetti'}
                </button>
              )}
            </div>

            {status.error && <p className="mt-4 text-sm text-rose-400">{status.error}</p>}

            {connected && (
              <dl className="mt-6 grid gap-3 border-t border-slate-800 pt-5 text-sm sm:grid-cols-3">
                <div><dt className="text-slate-500">Codex home</dt><dd className="mt-1 break-all text-slate-300">{status.codexHome || 'Non disponibile'}</dd></div>
                <div><dt className="text-slate-500">Piattaforma</dt><dd className="mt-1 text-slate-300">{status.platformFamily || 'Non disponibile'}</dd></div>
                <div><dt className="text-slate-500">Sistema operativo</dt><dd className="mt-1 text-slate-300">{status.platformOs || 'Non disponibile'}</dd></div>
              </dl>
            )}

            <div className="mt-6 border-t border-slate-800 pt-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-medium text-slate-300">Console app-server</h3>
                <button type="button" className="text-xs text-slate-500 transition hover:text-slate-300" onClick={() => setLogs([])}>
                  Pulisci
                </button>
              </div>
              <pre className="mt-2 min-h-32 max-h-56 overflow-auto rounded-md border border-slate-800 bg-black/30 p-3 font-mono text-xs leading-5 text-slate-400">
                {logs.length ? logs.join('\n') : 'Nessun output. Connetti codex app-server per iniziare.'}
              </pre>
            </div>
          </section>
        </div>
      </section>
    </div>
  )
}
