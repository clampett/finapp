import { finishLogout } from '../../../dashboard/src/common/session.js';

type GoogleIdentity = {
  initialize: (options: {
    client_id: string;
    nonce: string;
    auto_select: boolean;
    callback: (response: { credential?: string }) => void;
  }) => void;
  renderButton: (
    container: HTMLElement,
    options: { theme: string; size: string; width: number; text: string },
  ) => void;
  disableAutoSelect: () => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentity } };
  }
}

let sdkReady: Promise<GoogleIdentity> | undefined;

function loadGoogle(): Promise<GoogleIdentity> {
  if (window.google?.accounts.id) return Promise.resolve(window.google.accounts.id);
  if (sdkReady) return sdkReady;
  // Loaded the SDK independently of the password forms and reported blocked or slow downloads.
  sdkReady = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = window.setTimeout(() => fail(), 15000);
    const fail = () => {
      window.clearTimeout(timeout);
      script.remove();
      sdkReady = undefined;
      reject(new Error('Google sign-in could not load. Try again or use your FinApp username.'));
    };
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onerror = fail;
    script.onload = () => {
      window.clearTimeout(timeout);
      if (window.google?.accounts.id) resolve(window.google.accounts.id);
      else fail();
    };
    document.head.append(script);
  });
  return sdkReady;
}

export function setupGoogleSignIn(onCredential: (credential: string) => Promise<void>) {
  const container = document.getElementById('google-signin-btn');
  const status = document.getElementById('google-status');
  const error = document.getElementById('google-error');
  const retry = document.getElementById('google-retry') as HTMLButtonElement | null;
  if (!container || !status || !error || !retry) return;
  let request: AbortController | undefined;
  let identity: GoogleIdentity | undefined;
  let enabled = false;
  let width = 0;

  function render() {
    if (!identity || !enabled) return;
    // Rendered Google's visible button at its supported width without an invisible overlay.
    width = Math.min(400, Math.max(200, Math.floor(container!.getBoundingClientRect().width)));
    container!.replaceChildren();
    identity.renderButton(container!, {
      theme: document.documentElement.dataset.theme === 'light' ? 'outline' : 'filled_black',
      size: 'large',
      width,
      text: 'continue_with',
    });
  }

  async function initialize() {
    request?.abort();
    const controller = new AbortController();
    request = controller;
    enabled = false;
    container!.replaceChildren();
    status!.textContent = 'Loading Google sign-in…';
    error!.textContent = '';
    retry!.hidden = true;
    try {
      await finishLogout();
      // Used the same server configuration and browser-bound nonce as token verification.
      const response = await fetch('/api/v1/auth/google/config', {
        credentials: 'include',
        cache: 'no-store',
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      });
      if (!response.ok) throw new Error('Google sign-in is unavailable. Please try again.');
      const config = await response.json();
      if (controller.signal.aborted) return;
      if (!config.enabled) {
        status!.textContent = 'Google sign-in is unavailable. You can use your FinApp username.';
        retry!.hidden = false;
        return;
      }
      if (typeof config.clientId !== 'string' || typeof config.nonce !== 'string') {
        throw new Error('Google sign-in is unavailable. Please try again.');
      }
      identity = await loadGoogle();
      if (controller.signal.aborted) return;
      identity.initialize({
        client_id: config.clientId,
        nonce: config.nonce,
        auto_select: false,
        callback: ({ credential }) => {
          if (!credential) {
            error!.textContent = 'Google did not return a sign-in credential. Please try again.';
            return;
          }
          void onCredential(credential);
        },
      });
      // Required an explicit Google button click after sign-out or history navigation.
      identity.disableAutoSelect();
      enabled = true;
      render();
      status!.textContent = '';
    } catch (failure) {
      if (controller.signal.aborted) return;
      status!.textContent = '';
      error!.textContent =
        failure instanceof Error && failure.name !== 'TimeoutError'
          ? failure.message
          : 'Google sign-in took too long to load. Please try again.';
      retry!.hidden = false;
    }
  }

  retry.addEventListener('click', () => void initialize());
  // Kept the real button aligned with the card after resizing and theme changes.
  const resize = new ResizeObserver(() => {
    const nextWidth = Math.min(
      400,
      Math.max(200, Math.floor(container.getBoundingClientRect().width)),
    );
    if (nextWidth !== width) render();
  });
  resize.observe(container);
  const theme = new MutationObserver(render);
  theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('pagehide', () => request?.abort());
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) void initialize();
  });
  void initialize();
}
