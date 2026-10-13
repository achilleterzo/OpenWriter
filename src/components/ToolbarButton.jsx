export function ToolbarButton({ active = false, label, children, onClick }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`rounded-md p-2 transition ${
        active ? 'bg-accent-400 text-slate-950' : 'text-slate-300 hover:bg-slate-700 hover:text-slate-50'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function ToolbarDivider() {
  return <span className="mx-1 h-6 w-px bg-slate-700" aria-hidden="true" />
}

// Gruppo di strumenti: nell'andare a capo la barra spezza tra un gruppo e l'altro, mai dentro un gruppo. Il divisore sta a fine gruppo.
export function ToolbarGroup({ children }) {
  return <div className="relative flex items-center gap-1 pr-2 after:absolute after:right-0 after:top-1/2 after:h-6 after:w-px after:-translate-y-1/2 after:bg-slate-700 last:pr-0 last:after:hidden">{children}</div>
}
