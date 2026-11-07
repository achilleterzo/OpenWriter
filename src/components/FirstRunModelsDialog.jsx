import { useEffect } from 'react'
import { Cpu } from 'lucide-react'
import { SemanticModelPicker } from './LocalModelsSettings.jsx'
import { t } from '../i18n/index.js'

// Prima configurazione: al primo avvio (se nessun modello è già scaricato) chiede cosa usare in locale per la ricerca per significato e permette di scaricarlo.
// È la stessa scelta delle impostazioni → Modelli locali; chiudere la finestra non cambia nulla e non la ripropone (si può rivedere dalle impostazioni).
export default function FirstRunModelsDialog({ onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="first-run-models-title" className="grid max-h-full w-full max-w-lg gap-3 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-5 text-sm text-slate-200 shadow-xl">
        <div className="flex items-center gap-2">
          <Cpu className="text-accent-400" size={20} />
          <h2 id="first-run-models-title" className="text-lg font-semibold">{t('Set up search by meaning')}</h2>
        </div>
        <p className="text-sm leading-6 text-slate-400">{t('OpenWriter can find passages by meaning, not only by words, with a model that runs on this computer. No text leaves it. Choose what to use and download it now, or do it later in Settings → Local models.')}</p>
        <SemanticModelPicker />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" autoFocus className="rounded-md bg-accent-600 px-3 py-1.5 font-medium text-white transition hover:bg-accent-500" onClick={onClose}>{t('Done')}</button>
        </div>
      </div>
    </div>
  )
}
