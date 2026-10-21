import { authRequest, formError } from './main.js';
const form = document.getElementById('verify-form') as HTMLFormElement | null;
const input = document.getElementById('verification-code') as HTMLInputElement | null;
input?.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 6); });
form?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!input || !form.reportValidity()) return;
  const error = document.getElementById('verify-error')!;
  const status = document.getElementById('verify-status')!;
  const button = document.getElementById('verify_button') as HTMLButtonElement;
  if (button.disabled) return;
  error.textContent = ''; status.textContent = ''; button.disabled = true; button.textContent = 'Verifying…';
  try {
    await authRequest('verify-email', { token: input.value });
    status.textContent = 'Email verified. Opening sign in…';
    location.assign('/login?verified=true');
  } catch (err) {
    error.textContent = formError(err); button.disabled = false; button.textContent = 'Verify account ↗';
  }
});
