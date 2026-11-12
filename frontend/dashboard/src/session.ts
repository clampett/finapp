// Shared by the dashboard and landing pages. No credentials go in localStorage or URLs.
let pendingLogout: Promise<void> = Promise.resolve();
export function sessionToken(): string {
  try {
    return sessionStorage.getItem('finapp_session_token') ?? '';
  } catch {
    return '';
  }
}
export function sessionHeaders(): Record<string, string> {
  // Paired the cookie with a tab-only key, preventing a fresh tab from reusing
  // a leftover browser cookie without the matching sign-in state.
  const token = sessionToken();
  return token ? { 'X-FinApp-Session': token } : {};
}
export function clearSession(): void {
  try {
    sessionStorage.removeItem('finapp_user_id');
    sessionStorage.removeItem('finapp_session_token');
  } catch {
    /* An unavailable tab store cannot retain our sign-in state. */
  }
}
export function endSession(): Promise<void> {
  // Captured the token before clearing local identity. The logout request was
  // allowed to finish during navigation, while the UI was signed out immediately.
  const token = sessionToken();
  clearSession();
  if (token) {
    pendingLogout = fetch('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'include',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken: token }),
      signal: AbortSignal.timeout(10000),
    })
      .then(() => undefined)
      .catch(() => undefined);
  }
  return pendingLogout;
}
export function finishLogout(): Promise<void> {
  return pendingLogout;
}

export async function validSession(): Promise<boolean> {
  // Confirmed the account with the backend instead of trusting a stored user ID;
  // disabled response caching so a revoked session was not accepted from cache.
  if (!sessionToken()) return false;
  try {
    const response = await fetch('/api/v1/auth/session', {
      headers: sessionHeaders(),
      credentials: 'include',
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return false;
    const data = await response.json();
    return String(data.userId) === sessionStorage.getItem('finapp_user_id');
  } catch {
    return false;
  }
}

export function installPrivateSessionGuard(): void {
  const root = document.getElementById('root');
  // Hide snapshots before they enter the back/forward cache.
  window.addEventListener('pagehide', () => {
    if (root) root.style.visibility = 'hidden';
  });
  window.addEventListener('pageshow', async (event) => {
    // Revalidated restored browser-history snapshots before revealing their UI,
    // preventing Forward from reopening a workspace after Back had signed it out.
    if (!event.persisted) return;
    if (!(await validSession())) {
      clearSession();
      location.replace('/login');
      return;
    }
    if (root) root.style.visibility = '';
  });
}
