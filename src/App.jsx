import { useEffect, useState } from 'react'
import AiMenuButton from './components/AiMenuButton.jsx'
import DocumentEditor from './components/DocumentEditor.jsx'
import SettingsScreen from './components/SettingsScreen.jsx'

const electronAPI = window.electronAPI

export default function App() {
  const [status, setStatus] = useState('Non salvato')
  const [screen, setScreen] = useState('editor')

  useEffect(() => {
    if (!electronAPI) return undefined
    return electronAPI.onAppCommand((command) => {
      if (command === 'settings') setScreen('settings')
    })
  }, [])

  return (
    <>
      <main className="min-h-screen bg-slate-950 p-4 text-slate-100 sm:p-8">
        <section className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl sm:min-h-[calc(100vh-4rem)]">
          <header className="border-b border-slate-800 px-6 py-5">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-2xl font-semibold tracking-tight">Nuovo documento</h1>
              <span className="text-sm text-slate-500">{status}</span>
            </div>
          </header>
          <DocumentEditor onStatusChange={setStatus} />
        </section>
        <AiMenuButton />
      </main>
      {screen === 'settings' && <SettingsScreen onBack={() => setScreen('editor')} />}
    </>
  )
}
