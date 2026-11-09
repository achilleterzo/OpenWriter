import { useCallback, useEffect, useState } from 'react'

const electronAPI = window.electronAPI

/**
 * Gli spazi di lavoro (workspace) per l'interfaccia: `{ active, workspaces, temporary, activeWorkspace, refresh }`. `active` è l'id dello spazio attivo ('all' = tutti i progetti),
 * `activeWorkspace` la sua definizione (null con «Tutti»), `temporary` i percorsi dei membri temporanei (progetti aperti da un agente). Si rilegge da sé quando qualcosa cambia
 * (`workspaces:changed`), anche se a cambiarlo è stato un agente.
 */
export default function useWorkspaces() {
  const [state, setState] = useState({ active: 'all', workspaces: [], temporary: [] })
  const [loaded, setLoaded] = useState(false)
  const refresh = useCallback(async () => {
    try { setState(await electronAPI.listWorkspaces()); setLoaded(true) } catch { /* senza spazi di lavoro vale «Tutti» */ }
  }, [])
  useEffect(() => {
    refresh()
    return electronAPI?.onWorkspacesChanged?.(refresh)
  }, [refresh])
  const activeWorkspace = state.workspaces.find((item) => item.id === state.active) || null
  // `loaded`: i dati sono arrivati (prima l'elenco è vuoto, e non vuol dire che non ci siano spazi).
  return { ...state, activeWorkspace, loaded, refresh }
}
