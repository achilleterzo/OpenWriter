import { useEffect, useState } from 'react'
import { FolderSearch, Maximize2, Minimize2 } from 'lucide-react'
import { imageFileUrl } from '../lib/imagePaths.js'
import { formatDateTime, t } from '../i18n/index.js'

const electronAPI = window.electronAPI

const formatSize = (bytes) => {
  if (!Number.isFinite(bytes)) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * Scheda di visualizzazione di un'immagine del progetto, di sola lettura: adattata alla finestra o a grandezza reale, con dimensioni in pixel,
 * peso e data del file. Come la scheda del browser non ha un editor; l'assistente la vede con `view_image` (percorso dell'immagine).
 */
export default function ImagePane({ tab, active, onStatus, onInteract }) {
  const [fit, setFit] = useState(true)
  const [size, setSize] = useState(null)
  const [info, setInfo] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setInfo(null)
    setFailed(false)
    electronAPI.getFileInfo(tab.imagePath).then((value) => { if (!cancelled) setInfo(value) }).catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [tab.imagePath])

  const details = [
    size ? `${size.width} × ${size.height} px` : '',
    info ? formatSize(info.size) : '',
    info ? formatDateTime(info.modified, { dateStyle: 'medium', timeStyle: 'short' }) : '',
  ].filter(Boolean).join(' · ')

  return (
    <div className={active ? 'flex min-h-0 flex-1 flex-col' : 'hidden'} onMouseDown={() => onInteract?.(tab.id)} onWheel={() => onInteract?.(tab.id)}>
      <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-950/40 px-3 py-1.5 text-xs text-slate-400">
        <span className="min-w-0 flex-1 truncate" title={tab.imagePath}><span className="text-slate-200">{tab.title}</span>{details && <span className="ml-2">{details}</span>}</span>
        <button type="button" aria-label={fit ? t('Actual size') : t('Fit to window')} title={fit ? t('Actual size') : t('Fit to window')} className="rounded p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-50" onClick={() => setFit((value) => !value)}>
          {fit ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
        </button>
        <button type="button" aria-label={t('Show in file manager')} title={t('Show in file manager')} className="rounded p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-50" onClick={() => electronAPI.revealPath(tab.imagePath).catch((reason) => onStatus?.(reason.message))}>
          <FolderSearch size={15} />
        </button>
      </div>
      <div className={`image-stage min-h-0 flex-1 overflow-auto ${fit ? 'flex items-center justify-center p-4' : 'p-4'}`}>
        {failed
          ? <p className="m-auto text-sm text-slate-500">{t('The image could not be read')}</p>
          : (
            <img
              src={imageFileUrl(tab.imagePath)}
              alt={tab.title}
              draggable={false}
              className={fit ? 'max-h-full max-w-full object-contain' : 'max-w-none'}
              onLoad={(event) => setSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
              onError={() => setFailed(true)}
            />
          )}
      </div>
    </div>
  )
}
