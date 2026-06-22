import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuthProvider } from './shared/auth/AuthContext.jsx'
import { ThemeProvider } from './shared/theme/ThemeContext.jsx'
import { bootstrapDevTools } from './bootstrapDevTools.js'
import './shared/styles/tokens.css'
import './shared/styles/base.css'
import './shared/styles/auth.css'
import './shared/styles/shell.css'
import './shared/styles/editor.css'
import './shared/styles/panels.css'
import './shared/styles/graph.css'
import './shared/styles/tabs.css'
import './shared/styles/split.css'
import App from './App.jsx'

void bootstrapDevTools()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
