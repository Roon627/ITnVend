import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './pages/App.jsx'
import { ToastProvider } from './components/ToastContext.jsx'
import { CartProvider } from './components/CartContext.jsx'
import { SettingsProvider } from './components/SettingsContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <SettingsProvider>
        <CartProvider>
          <App />
        </CartProvider>
      </SettingsProvider>
    </ToastProvider>
  </StrictMode>,
)
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './pages/App.jsx'
import { ToastProvider } from './components/ToastContext'
import { CartProvider } from './components/CartContext'
import { SettingsProvider } from './components/SettingsContext'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ToastProvider>
      <SettingsProvider>
        <CartProvider>
          <App />
        </CartProvider>
      </SettingsProvider>
    </ToastProvider>
  </StrictMode>,
)
