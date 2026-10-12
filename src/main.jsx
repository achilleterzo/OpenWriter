import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './app.js'
import './appearance.js'
import './styles.css'
import { initLanguage } from './i18n/index.js'

initLanguage()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
