import { useContext, useRef, useState } from 'react'
import { ChevronDown, Layers, MoreHorizontal } from 'lucide-react'
import { ContextMenuContext } from './ContextMenu.jsx'
import WorkspaceDialog from './WorkspaceDialog.jsx'
import useWorkspaces from '../hooks/useWorkspaces.js'
import { t } from '../i18n/index.js'

const electronAPI = window.electronAPI

/**
 * Il selettore dello spazio di lavoro attivo: un pulsante con il nome (o «Tutti i progetti») che apre un menu per cambiarlo o crearne uno nuovo; accanto, un menu «…» con
 * «Nuovo» e «Modifica» (la modifica sta solo lì). `onAddProject`: se c'è, è la prima voce del menu «…» («Aggiungi progetto»: sceglie una cartella e ne fa un progetto).
 * Lo spazio attivo limita l'elenco dei progetti, la Home e la conoscenza che l'assistente e gli agenti raggiungono (docs/design/workspaces.md).
 */
export default function WorkspaceSelector({ className = '', fullWidth = false, value, onChange, embedded = false, onAddProject }) {
  const { active, workspaces, activeWorkspace } = useWorkspaces()
  // Con `onChange` è la scelta di dove cercare (non cambia lo spazio attivo): stesso aspetto, ma il menu elenca solo «Tutti i progetti» e gli spazi, e `value` è la scelta.
  const scope = typeof onChange === 'function'
  const shown = scope ? (workspaces.find((item) => item.id === value) || null) : activeWorkspace
  const openMenu = useContext(ContextMenuContext)
  const [dialog, setDialog] = useState(null) // { workspace } per modificare, {} per crearne uno
  const button = useRef(null)
  const more = useRef(null)
  const label = shown ? shown.name : t('All projects')

  function open() {
    const rect = button.current.getBoundingClientRect()
    const choose = (id) => () => (scope ? onChange(id) : electronAPI.setActiveWorkspace(id).catch(() => {}))
    const current = scope ? (shown ? shown.id : 'all') : active
    openMenu({
      x: rect.left,
      y: rect.bottom + 2,
      items: [
        { label: t('All projects'), hint: current === 'all' ? '✓' : undefined, bold: current === 'all', onClick: choose('all') },
        ...workspaces.map((item) => ({ label: item.name, hint: item.id === current ? '✓' : String(item.projects.length), bold: item.id === current, onClick: choose(item.id) })),
        ...(scope ? [] : [{ separator: true }, { label: t('New workspace…'), onClick: () => setDialog({}) }]),
      ],
    })
  }

  // Il menu «…»: crea uno spazio nuovo o modifica quello attivo (nome, progetti, eliminazione). Con «Tutti» non c'è nulla da modificare.
  function openActions() {
    const rect = more.current.getBoundingClientRect()
    openMenu({
      x: rect.left,
      y: rect.bottom + 2,
      items: [
        onAddProject && { label: t('Add project'), onClick: onAddProject },
        onAddProject && { separator: true },
        { label: t('New workspace…'), onClick: () => setDialog({}) },
        activeWorkspace
          ? { label: t('Edit “{name}”…', { name: activeWorkspace.name }), onClick: () => setDialog({ workspace: activeWorkspace }) }
          : { label: t('Edit workspace…'), disabled: true },
      ].filter(Boolean),
    })
  }

  const selectButton = (
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        title={scope ? t('Where to search: all the projects, or a workspace') : t('Workspace: limits the projects, the Home and the knowledge the assistant and the agents reach')}
        aria-label={`${scope ? t('Search in') : t('Workspace')}: ${label}`}
        className={`flex min-w-0 items-center gap-1.5 border px-2.5 py-1.5 text-xs transition ${embedded ? 'max-w-[11rem] shrink-0 rounded-l-lg rounded-r-none border-y-0 border-l-0 px-3 py-2' : 'rounded-md'} ${fullWidth ? 'min-w-0 flex-1' : ''} ${shown ? 'border-accent-400/60 bg-accent-500/10 text-accent-300 hover:bg-accent-500/20' : 'border-slate-700 text-slate-300 hover:bg-slate-800'} ${className}`}
        onClick={open}
      >
        <Layers size={14} className="shrink-0" />
        <span className={`truncate ${fullWidth ? 'flex-1 text-left' : ''}`}>{label}</span>
        <ChevronDown size={12} className="shrink-0 opacity-70" />
      </button>
  )

  // La scelta di dove cercare è il solo pulsante; il selettore dello spazio attivo ha accanto il menu «…».
  if (scope) return selectButton
  return (
    <div className={`flex min-w-0 items-center gap-1.5 ${fullWidth ? 'w-full' : ''}`}>
      {selectButton}
      <button
        ref={more}
        type="button"
        aria-haspopup="menu"
        aria-label={t('Workspace actions')}
        title={t('Workspace actions')}
        // Un menu «…» è solo l'icona: niente bordo, sfondo né sfondo al passaggio; al passaggio l'icona prende il colore d'accento. L'icona riempie il pulsante, alto quanto il selettore.
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md text-slate-400 outline-none transition hover:text-accent-400 focus-visible:text-accent-400 focus-visible:ring-1 focus-visible:ring-accent-400"
        onClick={openActions}
      ><MoreHorizontal size={22} /></button>
      {dialog && <WorkspaceDialog workspace={dialog.workspace || null} onClose={() => setDialog(null)} />}
    </div>
  )
}
