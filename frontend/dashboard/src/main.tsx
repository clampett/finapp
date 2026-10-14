import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'

// Add this line. Adjust the path if your file is inside a css/ folder
import './index.css' 

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)