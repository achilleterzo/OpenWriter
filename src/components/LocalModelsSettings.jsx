import { useEffect, useState } from 'react'
import { Cpu, Download, MonitorCog, Trash2 } from 'lucide-react'
import { formatNumber, t } from '../i18n/index.js'

const electronAPI = window.electronAPI
const megabytes = (bytes) => formatNumber(Math.round((bytes || 0) / 1e6))

// Modelli che girano su questo computer: si scaricano una volta, vivono nei dati dell'app (mai in un progetto) e qui si abilitano, si scaricano e si tolgono.
// Un progetto li usa solo se lo chiede nelle sue impostazioni. Per ora c'è il modello della ricerca per significato (semantic-pack.cjs), che può girare sulla
// CPU o sulla scheda video (WebGPU, sperimentale): ogni dispositivo ha il suo pacchetto e i suoi vettori, quindi passare dall'uno all'altro calcola solo ciò che
// manca. Un altro modello (visione, immagini, audio) è una nuova scheda nella lista.
function PackRow({ device, pack, selected, disabled, title, description, extra, downloading, onSelect, onDownload, onRemove }) {
  const installing = downloading || pack?.state === 'installing'
  const percent = pack?.total ? Math.min(100, Math.round(((pack.received || 0) / pack.total) * 100)) : 0
  let state = t('Not downloaded')
  if (installing) state = t('Downloading… {done} of {total} MB', { done: megabytes(pack?.received), total: megabytes(pack?.total || pack?.totalBytes) })
  else if (pack?.state === 'ready') state = t('The model is installed')
  const failure = !installing && pack?.error
  const Icon = device === 'gpu' ? MonitorCog : Cpu
  return (
    <div className={`grid gap-2 rounded-lg border p-3 ${selected ? 'border-accent-500/60 bg-accent-500/5' : 'border-slate-800'} ${disabled ? 'opacity-60' : ''}`}>
      <label className={`flex items-start gap-3 text-sm text-slate-300 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
        <input type="radio" name="semantic-device" checked={selected} disabled={disabled} className="mt-1 accent-accent-500" onChange={() => onSelect(device)} />
        <span className="min-w-0">
          <span className="flex items-center gap-2 font-medium"><Icon size={15} className="text-accent-400" /> {title}</span>
          <span className="block text-xs text-slate-500">{description}</span>
        </span>
      </label>
      {extra}
      <span className="text-xs text-slate-400">{state}</span>
      {installing && (
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-1.5 w-full max-w-md overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-accent-500 transition-all" style={{ width: `${percent}%` }} />
        </div>
      )}
      {failure && <span className="text-xs text-rose-400">{t('The download did not complete')}: {failure}</span>}
      <div className="flex flex-wrap items-center gap-3">
        {pack && pack.state !== 'ready' && (
          <button type="button" disabled={installing} className="flex items-center gap-2 rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-slate-600 disabled:opacity-50" onClick={() => onDownload(device)}>
            <Download size={13} /> {t('Download the model ({size} MB)', { size: megabytes(pack.totalBytes) })}
          </button>
        )}
        {pack?.state === 'ready' && (
          <button type="button" className="flex items-center gap-2 rounded-md bg-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:bg-slate-600" onClick={() => onRemove(device)}>
            <Trash2 size={13} /> {t('Remove the model')}
          </button>
        )}
      </div>
    </div>
  )
}

// Scelta del modello della ricerca per significato (abilitazione, dispositivo, scaricamento): sta nelle impostazioni e nella finestra di prima configurazione.
export function SemanticModelPicker() {
  const [status, setStatus] = useState(null)
  const [downloading, setDownloading] = useState({ cpu: false, gpu: false })
  const [error, setError] = useState('')
  const busy = downloading.cpu || downloading.gpu || status?.packs?.cpu?.state === 'installing' || status?.packs?.gpu?.state === 'installing'

  useEffect(() => {
    let cancelled = false
    const load = () => electronAPI.getSemanticStatus().then((value) => { if (!cancelled) setStatus(value) }).catch(() => {})
    load()
    // Una volta, all'apertura: quale scheda userebbe WebGPU (senza caricare il modello).
    electronAPI.probeGpu?.().then((value) => { if (!cancelled) setStatus(value) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const timer = setInterval(() => electronAPI.getSemanticStatus().then(setStatus).catch(() => {}), busy ? 1000 : 4000)
    return () => clearInterval(timer)
  }, [busy])

  async function run(action) {
    setError('')
    try { setStatus(await action()) } catch (reason) { setError(reason.message) }
  }

  async function download(device) {
    setDownloading((current) => ({ ...current, [device]: true }))
    await run(() => electronAPI.installSemanticPack(undefined, device))
    setDownloading((current) => ({ ...current, [device]: false }))
  }

  const gpu = status?.gpu
  const gpuInfo = gpu?.info
  const gpuUnsupported = gpuInfo && gpuInfo.webgpu === false
  const adapter = gpuInfo?.webgpu ? [gpuInfo.vendor, gpuInfo.architecture].filter(Boolean).join(' ') || t('Graphics card') : ''
  let gpuLine = null
  if (!gpuInfo) gpuLine = <span className="text-xs text-slate-500">{t('Checking the graphics card…')}</span>
  else if (gpuUnsupported) gpuLine = <span className="text-xs text-amber-400">{t('Not supported on this system: {reason}', { reason: gpuInfo.reason || '' })}</span>
  else gpuLine = <span className="text-xs text-slate-400">{t('Graphics card: {name}', { name: adapter })}</span>
  const failure = gpu?.failure ? <span className="block text-xs text-rose-400">{t('Graphics card failed ({error}): the CPU is in use.', { error: gpu.failure })}</span> : null
  const inUse = status?.activeDevice ? t('In use: {device}', { device: status.activeDevice === 'gpu' ? t('Graphics card') : 'CPU' }) : ''

  return (
    <>
        {error && <span className="text-xs text-rose-400">{error}</span>}
        <label className="flex items-start gap-3 text-sm text-slate-300">
          <input type="checkbox" checked={status?.allowed !== false} className="mt-1 accent-accent-500" onChange={(event) => run(() => electronAPI.setSemanticEnabled(event.target.checked))} />
          <span>{t('Use this model')}<span className="block text-xs text-slate-500">{t('If turned off, no project uses it.')}</span></span>
        </label>
        <div role="radiogroup" aria-label={t('Calculate with')} className="grid gap-2">
          <span className="text-sm text-slate-300">{t('Calculate with')}</span>
          <PackRow
            device="cpu"
            pack={status?.packs?.cpu}
            selected={status?.device !== 'gpu'}
            title="CPU"
            description={t('Works everywhere · {size} MB.', { size: megabytes(status?.packs?.cpu?.totalBytes) })}
            downloading={downloading.cpu}
            onSelect={(device) => run(() => electronAPI.setSemanticDevice(device))}
            onDownload={download}
            onRemove={(device) => run(() => electronAPI.removeSemanticPack(undefined, device))}
          />
          <PackRow
            device="gpu"
            pack={status?.packs?.gpu}
            selected={status?.device === 'gpu'}
            disabled={Boolean(gpuUnsupported)}
            title={t('Graphics card (experimental)')}
            description={t('Much faster, needs WebGPU · {size} MB.', { size: megabytes(status?.packs?.gpu?.totalBytes) })}
            extra={<div className="grid gap-1 pl-7">{gpuLine}{failure}</div>}
            downloading={downloading.gpu}
            onSelect={(device) => run(() => electronAPI.setSemanticDevice(device))}
            onDownload={download}
            onRemove={(device) => run(() => electronAPI.removeSemanticPack(undefined, device))}
          />
        </div>
        {inUse && <span className="text-xs text-slate-400">{inUse}</span>}
    </>
  )
}

export default function LocalModelsSettings() {
  return (
    <div className="grid grid-cols-1 gap-6">
      <p className="max-w-xl text-sm leading-6 text-slate-400">{t('Models that run on this computer, downloaded once.')}</p>
      <section className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-6">
        <div className="flex items-center gap-2">
          <Cpu className="text-accent-400" size={20} />
          <h2 className="text-lg font-semibold">{t('Search by meaning')}</h2>
        </div>
        <p className="max-w-xl text-sm leading-6 text-slate-400">{t('Finds passages by meaning, not only by words. No text leaves the computer.')}</p>
        <SemanticModelPicker />
      </section>
    </div>
  )
}
