import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App.jsx'
import { ToastProvider } from './components/ToastContext.jsx'
import { CartProvider } from './components/CartContext.jsx'
import { SettingsProvider } from './components/SettingsContext.jsx'
import { ThemeProvider } from './components/ThemeContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <SettingsProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </SettingsProvider>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
)
