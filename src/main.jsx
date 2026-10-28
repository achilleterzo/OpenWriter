import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { DialogProvider } from './components/Dialogs.jsx'
import './app.js'
import './appearance.js'
import './styles.css'
import { initLanguage } from './i18n/index.js'
import { installDiagnostics } from './lib/toasts.js'

initLanguage()
installDiagnostics()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DialogProvider>
      <App />
    </DialogProvider>
  </StrictMode>,
)
