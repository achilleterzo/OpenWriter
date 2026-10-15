// Gruppo di pulsanti a scelta singola (radio), usato nelle impostazioni.
export default function Segmented({ label, options, value, onChange }) {
  return (
    <div className="grid gap-2">
      <span className="text-sm text-slate-300">{label}</span>
      <div role="radiogroup" aria-label={label} className="inline-flex w-fit max-w-full flex-wrap overflow-hidden rounded-lg border border-slate-700">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            className={`px-4 py-2 text-sm transition ${value === option.value ? 'bg-accent-600 text-white' : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-50'}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
