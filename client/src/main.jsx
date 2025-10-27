import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App.jsx'
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
