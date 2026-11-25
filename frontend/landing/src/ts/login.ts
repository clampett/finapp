import { AuthError, authRequest, formError } from './main.js';
import { clearSession } from '../../../dashboard/src/common/session.js';
import { setupGoogleSignIn } from './google-signin.js';

const loginForm = document.getElementById('login-form') as HTMLFormElement | null;
const registrationForm = document.getElementById('registration-form') as HTMLFormElement | null;
const value = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
const showError = (id: string, message: string) => {
  const target = document.getElementById(id);
  if (target) target.textContent = message;
};

// Shared one sign-in attempt between Google and password submission.
let activeSignIn: AbortController | null = null;

function setSignInBusy(busy: boolean) {
  for (const id of ['login_button', 'register_button']) {
    const button = document.getElementById(id) as HTMLButtonElement | null;
    if (button) button.disabled = busy;
  }
  const google = document.getElementById('google-signin-btn');
  if (google) google.inert = busy;
}

async function openWorkspace(data: { userId?: number; sessionToken?: string }) {
  if (!data.userId || !Number.isInteger(data.userId) || data.userId < 1)
    throw new Error('The server did not return a valid workspace. Please try again.');
  if (!data.sessionToken) throw new Error('The server did not return a session. Please try again.');
  // Stored the account ID and matching session key only for this browser tab;
  // neither value was persisted with the longer-lived scenario drafts.
  try {
    sessionStorage.setItem('finapp_session_token', data.sessionToken);
    sessionStorage.setItem('finapp_user_id', String(data.userId));
  } catch {
    clearSession();
    // Revoked a newly issued session when browser storage prevented a complete sign-in.
    await authRequest('logout', { sessionToken: data.sessionToken }).catch(() => undefined);
    throw new Error(
      'Browser storage is required to open your workspace. Allow storage for this site and try again.',
    );
  }
  location.assign('/dashboard/');
}

setupGoogleSignIn(async (credential) => {
  if (activeSignIn) return;
  const controller = new AbortController();
  activeSignIn = controller;
  setSignInBusy(true);
  showError('google-error', '');
  const status = document.getElementById('google-status');
  if (status) status.textContent = 'Signing in with Google…';
  try {
    const data = await authRequest('google', { token: credential }, controller.signal);
    if (!controller.signal.aborted) await openWorkspace(data);
  } catch (error) {
    if (controller.signal.aborted) return;
    showError('google-error', formError(error));
    const retry = document.getElementById('google-retry');
    if (retry) retry.hidden = false;
  } finally {
    if (activeSignIn === controller) {
      activeSignIn = null;
      setSignInBusy(false);
      if (status) status.textContent = '';
    }
  }
});

window.addEventListener('pagehide', () => activeSignIn?.abort());

window.addEventListener('pageshow', () => {
  activeSignIn = null;
  setSignInBusy(false);
  // Reset restored form controls after Back navigation and cleared password
  // values so a cached sign-in page did not remain disabled or retain the secret.
  for (const [id, label] of [
    ['login_button', 'Sign in ↗'],
    ['register_button', 'Create account ↗'],
  ]) {
    const button = document.getElementById(id!) as HTMLButtonElement | null;
    if (button) {
      button.disabled = false;
      button.textContent = label!;
    }
  }
  document.querySelectorAll<HTMLInputElement>('#password, #confirm-password').forEach((input) => {
    input.value = '';
  });
});

if (new URLSearchParams(location.search).get('verified') === 'true') {
  const status = document.getElementById('login-status');
  if (status) status.textContent = 'Email verified. You can now sign in.';
}

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!loginForm.reportValidity()) return;
  const button = document.getElementById('login_button') as HTMLButtonElement;
  if (button.disabled || activeSignIn) return;
  const controller = new AbortController();
  activeSignIn = controller;
  setSignInBusy(true);
  showError('login-error', '');
  button.disabled = true;
  button.textContent = 'Signing in…';
  try {
    const data = await authRequest(
      'login',
      { username: value('username').trim(), password: value('password') },
      controller.signal,
    );
    if (!controller.signal.aborted) await openWorkspace(data);
  } catch (error) {
    if (controller.signal.aborted) return;
    if (error instanceof AuthError && error.status === 403 && error.userId) {
      // Resumed account verification after credentials had been checked, allowing
      // a user to request a fresh code without registering the same account again.
      location.assign(`/verify?userId=${error.userId}`);
      return;
    }
    showError('login-error', formError(error));
    button.disabled = false;
    button.textContent = 'Sign in ↗';
  } finally {
    if (activeSignIn === controller) {
      activeSignIn = null;
      setSignInBusy(false);
    }
  }
});

registrationForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!registrationForm.reportValidity()) return;
  const button = document.getElementById('register_button') as HTMLButtonElement;
  if (button.disabled || activeSignIn) return;
  showError('registration-error', '');
  if (value('password') !== value('confirm-password')) {
    showError(
      'registration-error',
      'Your passwords do not match. Check both fields and try again.',
    );
    document.getElementById('confirm-password')?.focus();
    return;
  }
  // BCrypt supports at most 72 bytes; a character limit alone is insufficient for Unicode.
  if (new TextEncoder().encode(value('password')).length > 72) {
    showError(
      'registration-error',
      'Use a password of at most 72 bytes. Some characters use more than one byte.',
    );
    return;
  }
  button.disabled = true;
  button.textContent = 'Creating your account…';
  const controller = new AbortController();
  activeSignIn = controller;
  setSignInBusy(true);
  try {
    const data = await authRequest(
      'register',
      {
        username: value('username').trim(),
        email: value('email').trim(),
        password: value('password'),
      },
      controller.signal,
    );
    if (controller.signal.aborted) return;
    if (!data.userId)
      throw new Error('Registration did not return an account. Please try signing in.');
    location.assign(`/verify?userId=${data.userId}`);
  } catch (error) {
    if (controller.signal.aborted) return;
    showError('registration-error', formError(error));
    button.disabled = false;
    button.textContent = 'Create account ↗';
  } finally {
    if (activeSignIn === controller) {
      activeSignIn = null;
      setSignInBusy(false);
    }
  }
});
