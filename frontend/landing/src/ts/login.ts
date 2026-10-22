import { AuthError, authRequest, formError } from './main.js';

const loginForm = document.getElementById('login-form') as HTMLFormElement | null;
const registrationForm = document.getElementById('registration-form') as HTMLFormElement | null;
const value = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
const showError = (id: string, message: string) => {
  const target = document.getElementById(id);
  if (target) target.textContent = message;
};
window.addEventListener('pageshow', () => {
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
  if (button.disabled) return;
  showError('login-error', '');
  button.disabled = true;
  button.textContent = 'Signing in…';
  try {
    const data = await authRequest('login', {
      username: value('username').trim(),
      password: value('password'),
    });
    if (!data.userId || !Number.isInteger(data.userId) || data.userId < 1)
      throw new Error('The server did not return a valid workspace. Please try again.');
    if (!data.sessionToken)
      throw new Error('The server did not return a session. Restart FinApp and try again.');
    // Stored the account ID and matching session key only for this browser tab;
    // neither value was persisted with the longer-lived scenario drafts.
    try {
      sessionStorage.setItem('finapp_session_token', data.sessionToken);
      sessionStorage.setItem('finapp_user_id', String(data.userId));
    } catch {
      throw new Error(
        'Browser storage is required to open your workspace. Allow storage for this site and try again.',
      );
    }
    location.assign('/dashboard/');
  } catch (error) {
    if (error instanceof AuthError && error.status === 403 && error.userId) {
      // Resumed account verification after credentials had been checked, allowing
      // a user to request a fresh code without registering the same account again.
      location.assign(`/verify?userId=${error.userId}`);
      return;
    }
    showError('login-error', formError(error));
    button.disabled = false;
    button.textContent = 'Sign in ↗';
  }
});

registrationForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!registrationForm.reportValidity()) return;
  const button = document.getElementById('register_button') as HTMLButtonElement;
  if (button.disabled) return;
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
  try {
    const data = await authRequest('register', {
      username: value('username').trim(),
      email: value('email').trim(),
      password: value('password'),
    });
    if (!data.userId)
      throw new Error('Registration did not return an account. Please try signing in.');
    location.assign(`/verify?userId=${data.userId}`);
  } catch (error) {
    showError('registration-error', formError(error));
    button.disabled = false;
    button.textContent = 'Create account ↗';
  }
});
