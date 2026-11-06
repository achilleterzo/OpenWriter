import { useEffect, useState } from 'react'
import { DatabaseZap } from 'lucide-react'
import { formatNumber, t } from '../i18n/index.js'

const electronAPI = window.electronAPI

// Avanzamento dell'indice di ricerca del progetto aperto, in fondo alla finestra: la scansione dei file (senza percentuale: dura poco) e il calcolo
// dei vettori della ricerca per significato (con percentuale: può durare minuti). Sparisce quando non c'è nulla da fare.
// Ha sempre un'etichetta, un'icona e un separatore dal messaggio di stato che gli sta accanto: la barra non deve sembrare l'avanzamento di quell'azione.
export default function IndexProgress({ project }) {
  const [activity, setActivity] = useState(null)

  useEffect(() => {
    setActivity(null)
    if (!project || !electronAPI.getIndexActivity) return undefined
    let cancelled = false
    const load = () => electronAPI.getIndexActivity().then((value) => { if (!cancelled) setActivity(value) }).catch(() => {})
    load()
    const timer = setInterval(load, 2000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [project])

  const vectors = activity?.vectors
  if (!vectors && !activity?.scanning) return null
  const percent = vectors ? Math.min(100, Math.floor((vectors.embedded / Math.max(1, vectors.total)) * 100)) : null
  const detail = vectors
    ? t('Indexing by meaning: {done} of {total}', { done: formatNumber(vectors.embedded), total: formatNumber(vectors.total) })
    : t('Updating the index…')
  const label = percent === null ? t('Updating the index…') : t('Indexing {percent}%', { percent })
  return (
    <span className="flex shrink-0 items-center gap-2 border-r border-slate-800 pr-4" title={detail}>
      <DatabaseZap size={13} className="text-accent-400" aria-hidden="true" />
      <span>{label}</span>
      <span
        role="progressbar"
        aria-label={detail}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-800"
      >
        <span className={`block h-full rounded-full bg-accent-500 transition-all ${percent === null ? 'w-1/3 animate-pulse' : ''}`} style={percent === null ? undefined : { width: `${percent}%` }} />
      </span>
    </span>
  )
}
