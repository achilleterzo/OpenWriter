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
