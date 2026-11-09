/**
 * Un interruttore (al posto della casella di spunta): `checked` lo accende, `onChange(valore)` riceve il nuovo stato.
 * Sta bene dentro una <label>: un clic sul testo lo aziona.
 */
export default function Switch({ checked, onChange, disabled = false, label, title, className = '' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      aria-label={label}
      title={title}
      disabled={disabled}
      className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full outline-none transition focus-visible:ring-1 focus-visible:ring-accent-400 disabled:opacity-50 ${checked ? 'bg-accent-600' : 'bg-slate-700'} ${className}`}
      onClick={() => onChange(!checked)}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  )
}
