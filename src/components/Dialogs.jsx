import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../i18n/index.js'

// In Electron window.prompt non esiste e window.confirm lascia la finestra con il focus rotto (campi e select non selezionabili):
// conferme e richieste di testo passano da questa finestra interna.
const DialogContext = createContext(null)

export const useDialogs = () => useContext(DialogContext)

function DialogBox({ dialog, onClose }) {
  const [value, setValue] = useState(dialog.initial || '')
  const confirmRef = useRef(null)

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(dialog.kind === 'prompt' || dialog.kind === 'choice' ? null : false) }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [dialog, onClose])

  const accept = () => onClose(dialog.kind === 'prompt' ? value : true)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(dialog.kind === 'prompt' || dialog.kind === 'choice' ? null : false) }}>
      <form role="dialog" aria-modal="true" aria-label={dialog.message} className="grid w-full max-w-sm gap-3 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200 shadow-xl" onSubmit={(event) => { event.preventDefault(); accept() }}>
        <p className="break-words">{dialog.message}</p>
        {dialog.detail && <p className="whitespace-pre-line break-words text-xs text-slate-400">{dialog.detail}</p>}
        {dialog.kind === 'prompt' && (
          <input autoFocus value={value} className="w-full rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-slate-100 outline-none focus:border-accent-400" onChange={(event) => setValue(event.target.value)} />
        )}
        {dialog.kind === 'choice' ? (
          <div className="flex flex-wrap justify-end gap-2">
            {dialog.choices.map((choice, position) => (
              <button
                key={choice.value}
                type="button"
                autoFocus={position === 0}
                className={`rounded-md px-3 py-1.5 transition ${choice.primary ? 'bg-accent-600 font-medium text-white hover:bg-accent-500' : choice.danger ? 'text-rose-300 hover:bg-rose-500/15' : 'text-slate-300 hover:bg-slate-800'}`}
                onClick={() => onClose(choice.value)}
              >{choice.label}</button>
            ))}
          </div>
        ) : (
        <div className="flex justify-end gap-2">
            <button type="button" className="rounded-md px-3 py-1.5 text-slate-300 transition hover:bg-slate-800" onClick={() => onClose(dialog.kind === 'prompt' ? null : false)}>{t('Cancel')}</button>
            <button ref={confirmRef} autoFocus={dialog.kind !== 'prompt'} type="submit" className={`rounded-md px-3 py-1.5 font-medium text-white transition ${dialog.danger ? 'bg-rose-600 hover:bg-rose-500' : 'bg-accent-600 hover:bg-accent-500'}`}>{dialog.confirmLabel || t('OK')}</button>
          </div>
        )}
      </form>
    </div>
  )
}

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null)
  const resolver = useRef(null)
  const returnFocus = useRef(null)

  const open = useCallback((spec) => new Promise((resolve) => {
    returnFocus.current = document.activeElement
    resolver.current = resolve
    setDialog(spec)
  }), [])

  const close = useCallback((result) => {
    resolver.current?.(result)
    resolver.current = null
    setDialog(null)
    // Il focus torna dove era (l'editor, il campo di testo…).
    setTimeout(() => returnFocus.current?.focus?.(), 0)
  }, [])

  // Conferme chieste dal processo principale (eliminare, spostare…): stessa finestra delle altre, la risposta torna indietro.
  useEffect(() => {
    const electronAPI = window.electronAPI
    if (!electronAPI?.onDialogAsk) return undefined
    return electronAPI.onDialogAsk(({ id, message, detail, confirmLabel, danger }) => {
      open({ kind: 'confirm', message, detail, confirmLabel, danger }).then((answer) => electronAPI.answerDialog(id, answer === true))
    })
  }, [open])

  const api = useMemo(() => ({
    confirm: (message, options = {}) => open({ kind: 'confirm', message, ...options }),
    // Scelta tra più azioni: restituisce il `value` scelto, o null se si annulla (Esc o clic fuori).
    choose: (message, choices) => open({ kind: 'choice', message, choices }),
    prompt: (message, initial = '', options = {}) => open({ kind: 'prompt', message, initial, ...options }),
  }), [open])

  return (
    <DialogContext.Provider value={api}>
      {children}
      {dialog && <DialogBox dialog={dialog} onClose={close} />}
    </DialogContext.Provider>
  )
}
