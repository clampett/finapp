import { authRequest, formError } from './main.js';
const form = document.getElementById('verify-form') as HTMLFormElement | null;
const input = document.getElementById('verification-code') as HTMLInputElement | null;
const userId = new URLSearchParams(location.search).get('userId') ?? '';
// Bound code submissions to the registered account ID; the code alone was not
// sufficient to select another account that happened to receive the same digits.
const resend = document.getElementById('resend-code') as HTMLButtonElement | null;
if (!/^[1-9][0-9]*$/.test(userId)) {
  document.getElementById('verify-error')!.textContent =
    'Sign in or register first to open verification for your account.';
  if (resend) resend.disabled = true;
}
resend?.addEventListener('click', async () => {
  // Disabled repeat clicks while a replacement code was issued. The backend
  // invalidated the previous code and printed the new one in the Spring terminal.
  resend.disabled = true;
  const error = document.getElementById('verify-error')!;
  const status = document.getElementById('verify-status')!;
  error.textContent = '';
  status.textContent = '';
  try {
    const data = await authRequest('resend-verification', { userId });
    status.textContent = data.message ?? 'Check your Spring Boot terminal for the new code.';
  } catch (err) {
    error.textContent = formError(err);
  } finally {
    resend.disabled = false;
  }
});
input?.addEventListener('input', () => {
  input.value = input.value.replace(/\D/g, '').slice(0, 6);
});
form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!input || !form.reportValidity()) return;
  const error = document.getElementById('verify-error')!;
  const status = document.getElementById('verify-status')!;
  const button = document.getElementById('verify_button') as HTMLButtonElement;
  if (button.disabled) return;
  error.textContent = '';
  status.textContent = '';
  button.disabled = true;
  button.textContent = 'Verifying…';
  try {
    await authRequest('verify-email', { token: input.value, userId });
    status.textContent = 'Email verified. Opening sign in…';
    location.assign('/login?verified=true');
  } catch (err) {
    error.textContent = formError(err);
    button.disabled = false;
    button.textContent = 'Verify account ↗';
  }
});
