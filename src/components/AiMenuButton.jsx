import { Sparkles } from 'lucide-react'

export default function AiMenuButton() {
  return (
    <button
      type="button"
      aria-label="Apri assistente AI"
      title="Assistente AI"
      className="fixed bottom-5 right-5 z-10 flex h-12 w-12 items-center justify-center rounded-full border border-violet-300/40 bg-violet-600 text-white shadow-lg shadow-violet-950/50 transition hover:scale-105 hover:bg-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:ring-offset-2 focus:ring-offset-slate-950"
    >
      <Sparkles size={21} strokeWidth={2.2} />
    </button>
  )
}
