import { useEffect, useState } from 'react'
import { Cpu, Download, Trash2 } from 'lucide-react'
import { formatNumber, t } from '../i18n/index.js'

const electronAPI = window.electronAPI
const megabytes = (bytes) => formatNumber(Math.round((bytes || 0) / 1e6))

// Modelli che girano su questo computer: si scaricano una volta, vivono nei dati dell'app (mai in un progetto) e qui si abilitano, si scaricano e si tolgono.
// Un progetto li usa solo se lo chiede nelle sue impostazioni. Per ora c'è il modello della ricerca per significato (semantic-pack.cjs); un altro
// modello (visione, immagini, audio) è una nuova voce in `models`, con la stessa scheda.
export default function LocalModelsSettings() {
  const [status, setStatus] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const load = () => electronAPI.getSemanticStatus().then((value) => { if (!cancelled) setStatus(value) }).catch(() => {})
    load()
    const timer = setInterval(load, downloading ? 1000 : 4000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [downloading])

  async function run(action) {
    setError('')
    try { setStatus(await action()) } catch (reason) { setError(reason.message) }
  }

  async function download() {
    setDownloading(true)
    await run(() => electronAPI.installSemanticPack())
    setDownloading(false)
  }

  const models = [{
    id: 'embeddings',
    icon: Cpu,
    name: t('Search by meaning'),
    description: (size) => t('Multilingual embedding model (multilingual-e5-small), about {size} MB. It lets the search find passages by meaning and not only by words. It runs on this computer: no text leaves it.', { size }),
    pack: status?.pack,
    allowed: status?.allowed !== false,
    onToggle: (value) => run(() => electronAPI.setSemanticEnabled(value)),
    onDownload: download,
    onRemove: () => run(() => electronAPI.removeSemanticPack()),
  }]

  return (
    <div className="grid grid-cols-1 gap-6">
      <p className="max-w-xl text-sm leading-6 text-slate-400">{t('Models that run on this computer, downloaded once and kept in the app data, never in a project. A project uses them only if it asks for them in its settings.')}</p>
      {models.map((model) => {
        const pack = model.pack
        const installing = downloading || pack?.state === 'installing'
        const percent = pack?.total ? Math.min(100, Math.round(((pack.received || 0) / pack.total) * 100)) : 0
        const Icon = model.icon
        let state = t('Not downloaded')
        if (installing) state = t('Downloading… {done} of {total} MB', { done: megabytes(pack?.received), total: megabytes(pack?.total || pack?.totalBytes) })
        else if (pack?.state === 'ready') state = t('The model is installed')
        const failure = !installing && pack?.error
        return (
          <section key={model.id} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
            <div className="flex items-center gap-2">
              <Icon className="text-accent-400" size={20} />
              <h2 className="text-lg font-semibold">{model.name}</h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-slate-400">{model.description(megabytes(pack?.totalBytes))}</p>
            <span className="text-xs text-slate-400">{state}</span>
            {installing && (
              <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-1.5 w-full max-w-md overflow-hidden rounded-full bg-slate-800">
                <div className="h-full rounded-full bg-accent-500 transition-all" style={{ width: `${percent}%` }} />
              </div>
            )}
            {failure && <span className="text-xs text-rose-400">{t('The download did not complete')}: {failure}</span>}
            {error && <span className="text-xs text-rose-400">{error}</span>}
            <label className="flex items-start gap-3 text-sm text-slate-300">
              <input type="checkbox" checked={model.allowed} className="mt-1 accent-accent-500" onChange={(event) => model.onToggle(event.target.checked)} />
              <span>{t('Use this model')}<span className="block text-xs text-slate-500">{t('Turned off, no project uses it and nothing is computed, even if the model is installed.')}</span></span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              {pack && pack.state !== 'ready' && (
                <button type="button" disabled={installing} className="flex items-center gap-2 rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-slate-600 disabled:opacity-50" onClick={model.onDownload}>
                  <Download size={13} /> {t('Download the model ({size} MB)', { size: megabytes(pack.totalBytes) })}
                </button>
              )}
              {pack?.state === 'ready' && (
                <button type="button" className="flex items-center gap-2 rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-slate-600" onClick={model.onRemove}>
                  <Trash2 size={13} /> {t('Remove the model')}
                </button>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}
