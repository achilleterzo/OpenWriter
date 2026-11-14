import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Settings2 } from 'lucide-react'
import { SettingsActionsContext } from './SettingsActions.jsx'
import { t } from '../i18n/index.js'

/**
 * L'impalcatura delle finestre di impostazioni: intestazione (con a destra le azioni che le sezioni vi portano, vedi SettingsActions.jsx),
 * elenco delle sezioni a sinistra e pannello a destra. La usano le impostazioni generali e quelle di un progetto, così hanno lo stesso aspetto.
 * `sections`: [{ id, label, icon }]; `eyebrow`: la riga sopra il titolo (con l'icona); `subtitle`: sotto il titolo, per esempio il nome del progetto;
 * `layer`: la classe z della finestra (quella del progetto sta sopra le altre schermate); `children`: il contenuto della sezione scelta.
 */
// Le impostazioni aperte, dalla più vecchia alla più recente: Esc e Tab riguardano solo l'ultima.
const shellStack = []
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function SettingsShell({ sections, section, onSection, onClose, eyebrow, eyebrowIcon: EyebrowIcon = Settings2, subtitle = '', layer = 'z-20', backLabel = t('Back to the document'), children }) {
  const current = sections.find((item) => item.id === section) || sections[0]
  const pressedOnBackdrop = useRef(false)
  // L'elemento a destra dell'intestazione dove le sezioni portano le loro azioni; in stato perché il contesto si aggiorni quando esiste.
  const [actionsSlot, setActionsSlot] = useState(null)

  const dialog = useRef(null)

  useEffect(() => {
    const shell = dialog.current
    shellStack.push(shell)
    const before = document.activeElement
    if (shell && !shell.contains(document.activeElement)) shell.focus({ preventScroll: true })

    // Esc chiude una sola finestra: la più in alto. Con un'altra finestra modale aperta sopra (per esempio la scelta del modello) tocca a lei, e con due
    // impostazioni una sull'altra (quelle del progetto sopra le generali) solo all'ultima aperta.
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape' || shellStack[shellStack.length - 1] !== shell) return
      const above = [...document.querySelectorAll('[aria-modal="true"]')].some((other) => !other.hasAttribute('data-settings-shell'))
      if (above) return
      event.stopPropagation()
      onClose()
    }

    // Il fuoco resta nella finestra: Tab dall'ultimo elemento torna al primo, Maiusc+Tab dal primo all'ultimo; con il fuoco finito fuori, rientra.
    // Una finestra modale annidata gestisce il proprio Tab.
    const keepFocus = (event) => {
      if (event.key !== 'Tab' || shellStack[shellStack.length - 1] !== shell) return
      const active = document.activeElement
      const inner = active?.closest?.('[aria-modal="true"]')
      if (inner && inner !== shell) return
      const targets = [...shell.querySelectorAll(FOCUSABLE)].filter((item) => item.offsetParent !== null || item === active)
      if (!targets.length) { event.preventDefault(); shell.focus(); return }
      const first = targets[0]
      const last = targets[targets.length - 1]
      if (!shell.contains(active) || active === shell) { event.preventDefault(); (event.shiftKey ? last : first).focus() }
      else if (event.shiftKey && active === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && active === last) { event.preventDefault(); first.focus() }
    }

    window.addEventListener('keydown', closeOnEscape, true)
    window.addEventListener('keydown', keepFocus, true)
    return () => {
      window.removeEventListener('keydown', closeOnEscape, true)
      window.removeEventListener('keydown', keepFocus, true)
      const index = shellStack.lastIndexOf(shell)
      if (index >= 0) shellStack.splice(index, 1)
      // Alla chiusura il fuoco torna dove era: chi usa la tastiera riprende da dove aveva aperto le impostazioni.
      if (before?.isConnected && typeof before.focus === 'function') before.focus({ preventScroll: true })
    }
  }, [onClose])

  return (
    // Si chiude solo se click e rilascio avvengono entrambi sullo sfondo: trascinare una selezione fuori dal pannello non deve chiuderlo.
    <SettingsActionsContext.Provider value={actionsSlot}>
      <div
        className={`fixed inset-0 ${layer} flex items-center justify-center bg-slate-950/75 p-4 text-slate-100 backdrop-blur-sm sm:p-8`}
        onMouseDown={(event) => { pressedOnBackdrop.current = event.target === event.currentTarget }}
        onClick={(event) => { if (pressedOnBackdrop.current && event.target === event.currentTarget) onClose() }}
      >
        <section ref={dialog} tabIndex={-1} data-settings-shell role="dialog" aria-modal="true" aria-labelledby="settings-title" className="flex outline-none h-[min(900px,calc(100vh-2rem))] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
          <header className="flex items-center gap-4 border-b border-slate-800 px-6 py-5">
            <button type="button" aria-label={backLabel} title={backLabel} className="rounded-md p-2 text-slate-400 transition hover:bg-slate-800 hover:text-slate-50" onClick={onClose}>
              <ArrowLeft size={19} />
            </button>
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium uppercase tracking-[0.25em] text-accent-400"><EyebrowIcon size={15} className="shrink-0" /> <span className="truncate">{eyebrow || t('Settings')}</span></p>
              <h1 id="settings-title" className="mt-1 truncate text-2xl font-semibold tracking-tight">{current.label}</h1>
              {subtitle && <p className="truncate text-sm text-slate-400" title={subtitle}>{subtitle}</p>}
            </div>
            <div ref={setActionsSlot} className="ml-auto flex min-w-0 items-center justify-end gap-3" />
          </header>

          <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            <nav role="tablist" aria-orientation="vertical" aria-label={t('Settings sections')} className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-800 p-3 sm:w-52 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r">
              {sections.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={current.id === id}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${current.id === id ? 'bg-accent-500/15 font-medium text-accent-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-50'}`}
                  onClick={() => onSection(id)}
                >
                  <Icon size={17} /> {label}
                </button>
              ))}
            </nav>

            <div role="tabpanel" className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-6 sm:p-8">
              {children}
            </div>
          </div>
        </section>
      </div>
    </SettingsActionsContext.Provider>
  )
}
