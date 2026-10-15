import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Check authentication before rendering the app
if (typeof window !== 'undefined') {
  const token = localStorage.getItem('auth_token');
  
  if (!token) {
    // Redirect to login page if not authenticated
    window.location.href = "/login.html";
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)