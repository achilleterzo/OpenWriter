import { ArrowLeft, Settings2 } from 'lucide-react'
import AiProviderSettings from './AiProviderSettings.jsx'

export default function SettingsScreen({ onBack }) {
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

        <div className="grid gap-6 overflow-y-auto p-6 sm:p-10">
          <AiProviderSettings />
        </div>
      </section>
    </div>
  )
}
