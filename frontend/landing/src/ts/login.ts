import { authRequest, formError } from './main.js';

const loginForm = document.getElementById('login-form') as HTMLFormElement | null;
const registrationForm = document.getElementById('registration-form') as HTMLFormElement | null;
const value = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
const showError = (id: string, message: string) => { const target = document.getElementById(id); if (target) target.textContent = message; };

if (new URLSearchParams(location.search).get('verified') === 'true') {
  const status = document.getElementById('login-status');
  if (status) status.textContent = 'Email verified. You can now sign in.';
}

loginForm?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!loginForm.reportValidity()) return;
  const button = document.getElementById('login_button') as HTMLButtonElement;
  if (button.disabled) return;
  showError('login-error', ''); button.disabled = true; button.textContent = 'Signing in…';
  try {
    const data = await authRequest('login', { username: value('username').trim(), password: value('password') });
    if (!data.userId || !Number.isInteger(data.userId) || data.userId < 1) throw new Error('The server did not return a valid workspace. Please try again.');
    try { sessionStorage.setItem('finapp_user_id', String(data.userId)); }
    catch { throw new Error('Browser storage is required to open your workspace. Allow storage for this site and try again.'); }
    location.assign('/dashboard/');
  } catch (error) {
    showError('login-error', formError(error)); button.disabled = false; button.textContent = 'Sign in ↗';
  }
});

registrationForm?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!registrationForm.reportValidity()) return;
  const button = document.getElementById('register_button') as HTMLButtonElement;
  if (button.disabled) return;
  showError('registration-error', '');
  if (value('password') !== value('confirm-password')) {
    showError('registration-error', 'Your passwords do not match. Check both fields and try again.');
    document.getElementById('confirm-password')?.focus(); return;
  }
  // BCrypt supports at most 72 bytes; a character limit alone is insufficient for Unicode.
  if (new TextEncoder().encode(value('password')).length > 72) {
    showError('registration-error', 'Use a password of at most 72 bytes. Some characters use more than one byte.'); return;
  }
  button.disabled = true; button.textContent = 'Creating your account…';
  try {
    await authRequest('register', { username: value('username').trim(), email: value('email').trim(), password: value('password') });
    location.assign('/verify');
  } catch (error) {
    showError('registration-error', formError(error)); button.disabled = false; button.textContent = 'Create account ↗';
  }
});
