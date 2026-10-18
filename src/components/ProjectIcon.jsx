import { useProjectIcon } from '../lib/projectIcons.js'

// Icona di un progetto: l'immagine scelta dall'utente, o `fallback` (l'icona predefinita) se non ne ha.
// `className` sostituisce la forma predefinita (angoli appena arrotondati, immagine intera): serve per un avatar tondo.
// Avatar tondo del progetto: la sua icona, o l'iniziale del nome se non ne ha. `active`: è il progetto aperto.
export function ProjectAvatar({ directory, name, active = false, size = 36 }) {
  const initial = Array.from(String(name || '?').trim())[0]?.toUpperCase() || '?'
  return (
    <span style={{ width: size, height: size }} className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border ${active ? 'border-accent-400/70' : 'border-slate-700'} bg-slate-800`}>
      <ProjectIcon
        directory={directory}
        size={size}
        className="h-full w-full rounded-full object-cover"
        fallback={<span style={{ fontSize: Math.round(size * 0.4) }} className={`font-semibold ${active ? 'text-accent-300' : 'text-slate-400'}`}>{initial}</span>}
      />
    </span>
  )
}

export default function ProjectIcon({ directory, size = 16, fallback = null, className = 'rounded-sm object-contain' }) {
  const icon = useProjectIcon(directory)
  if (!icon) return fallback
  return <img src={icon} alt="" width={size} height={size} draggable={false} className={`shrink-0 ${className}`} style={{ width: size, height: size }} />
}
