import { createContext, useContext } from 'react'
import { createPortal } from 'react-dom'

// Le azioni di una sezione delle impostazioni (per esempio "Salva impostazioni") stanno a destra dell'intestazione della finestra, sempre in vista.
// La finestra delle impostazioni offre lo spazio (`SettingsActionsContext`, un elemento dell'intestazione); una sezione vi porta le sue azioni con
// `SettingsHeaderActions`. Fuori da quella finestra (per esempio nella finestra del singolo progetto) si mostra invece `fallback`.
export const SettingsActionsContext = createContext(null)

export function SettingsHeaderActions({ children, fallback = null }) {
  const slot = useContext(SettingsActionsContext)
  return slot ? createPortal(children, slot) : fallback
}
