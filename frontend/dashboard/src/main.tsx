import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import { clearSession, endSession, installPrivateSessionGuard, validSession } from './session';
import './index.css';

async function startWorkspace() {
  // Allowed public demos immediately, but verified private sessions before React
  // mounted the workspace or started fetching account data.
  const demo = new URLSearchParams(location.search).get('demo') === 'true';
  if (demo) {
    void endSession();
  } else {
    installPrivateSessionGuard();
    if (!(await validSession())) {
      clearSession();
      location.replace('/login');
      return;
    }
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
void startWorkspace();
