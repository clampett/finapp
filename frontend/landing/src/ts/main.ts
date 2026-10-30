import { endSession, finishLogout } from '../../../dashboard/src/session.js';

// Returning here with Back ends the private workspace session, including bfcache restores.
void endSession();
window.addEventListener('pageshow', () => {
  void endSession();
});

const storage = {
  // Treated theme persistence as optional so restricted browser storage did not
  // prevent public pages or authentication forms from loading.
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* Theme preference is optional. */
    }
  },
};
const doc = document.documentElement;
const themeButton = document.getElementById('theme_button');
function applyTheme(theme: 'light' | 'dark') {
  doc.dataset.theme = theme;
  const label = `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`;
  themeButton?.setAttribute('aria-label', label);
  themeButton?.setAttribute('title', label);
  themeButton?.setAttribute('aria-pressed', String(theme === 'light'));
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'light' ? '#f3f4f7' : '#0c1018');
}
const systemTheme = matchMedia('(prefers-color-scheme: light)');
const preferredTheme = storage.get('user-theme');
applyTheme(
  preferredTheme === 'light' || preferredTheme === 'dark'
    ? preferredTheme
    : systemTheme.matches
      ? 'light'
      : 'dark',
);
themeButton?.addEventListener('click', () => {
  const theme = doc.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(theme);
  storage.set('user-theme', theme);
});
// Synchronized open public tabs without replacing a preference explicitly selected by the user.
window.addEventListener('storage', (event) => {
  if (event.key === 'user-theme') {
    applyTheme(
      event.newValue === 'light' || event.newValue === 'dark'
        ? event.newValue
        : systemTheme.matches
          ? 'light'
          : 'dark',
    );
  }
});
systemTheme.addEventListener('change', (event) => {
  if (!storage.get('user-theme')) applyTheme(event.matches ? 'light' : 'dark');
});
const menu = document.getElementById('site-navigation');
// Synchronized the mobile menu's visible state and accessibility attributes,
// with dismissal handled by navigation, Escape, outside clicks, and resizing.
const menuButton = document.getElementById('menu-toggle');
function closeMenu() {
  menu?.classList.remove('is-open');
  menuButton?.setAttribute('aria-expanded', 'false');
  menuButton?.setAttribute('aria-label', 'Open navigation');
}
menuButton?.addEventListener('click', () => {
  const open = menu?.classList.toggle('is-open') ?? false;
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
});
menu?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && menu?.classList.contains('is-open')) {
    closeMenu();
    menuButton?.focus();
  }
});
document.addEventListener('click', (e) => {
  if (e.target instanceof Element && !e.target.closest('.site-header')) closeMenu();
});
const menuBreakpoint = matchMedia('(min-width:851px)');
menuBreakpoint.addEventListener('change', (e) => {
  if (e.matches) closeMenu();
});

document.querySelectorAll<HTMLButtonElement>('[data-password-toggle]').forEach((button) =>
  button.addEventListener('click', () => {
    const input = document.getElementById(
      button.dataset.passwordToggle ?? '',
    ) as HTMLInputElement | null;
    if (!input) return;
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    button.textContent = visible ? 'Hide' : 'Show';
    button.setAttribute('aria-pressed', String(visible));
  }),
);

const samples: Record<
  string,
  {
    worth: number;
    surplus: number;
    debt: number;
    income: number;
    checking: number;
    investments: number;
    expenses: number;
    investmentName: string;
    debtName: string;
  }
> = {
  // Kept landing previews as fixed examples; actual demo requests were made by
  // the dashboard, and browser scenario edits were never read into these cards.
  '1': {
    worth: -27000,
    surplus: 1816.664,
    debt: 30000,
    income: 4583.33,
    checking: 1800,
    investments: 1200,
    expenses: 1400,
    investmentName: 'Roth IRA',
    debtName: 'Student loans',
  },
  '2': {
    worth: 95200,
    surplus: 3950,
    debt: 14000,
    income: 11250,
    checking: 6200,
    investments: 88000,
    expenses: 4600,
    investmentName: '401(k)',
    debtName: 'Auto loan',
  },
  '3': {
    worth: 139500,
    surplus: 4333.336,
    debt: 0,
    income: 8166.67,
    checking: 2500,
    investments: 117000,
    expenses: 2200,
    investmentName: 'Investment accounts',
    debtName: 'No outstanding debt',
  },
};
const usd = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
document.querySelectorAll<HTMLButtonElement>('[data-preview]').forEach((button) =>
  button.addEventListener('click', () => {
    const id = button.dataset.preview ?? '2',
      sample = samples[id];
    if (!sample) return;
    document
      .querySelectorAll('[data-preview]')
      .forEach((tab) => tab.setAttribute('aria-pressed', String(tab === button)));
    const values: Record<string, string> = {
      'preview-worth': usd(sample.worth),
      'preview-surplus': usd(sample.surplus),
      'preview-debt': usd(sample.debt),
      'preview-income': usd(sample.income),
      'preview-checking': usd(sample.checking),
      'preview-investment': usd(sample.investments),
      'preview-expenses': `${usd(sample.expenses)} /mo`,
      'preview-debt-node': usd(sample.debt),
      'preview-investment-name': sample.investmentName,
      'preview-debt-name': sample.debtName,
    };
    for (const [key, value] of Object.entries(values)) {
      const element = document.getElementById(key);
      if (element) element.textContent = value;
    }
    document.getElementById('preview-worth')?.classList.toggle('negative', sample.worth < 0);
    const link = document.getElementById('preview-open') as HTMLAnchorElement | null;
    if (link) {
      link.href = `/dashboard/?demo=true&profile=${id}`;
      link.textContent = `Open ${button.textContent} demo ↗`;
    }
  }),
);

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number,
    public userId?: number,
  ) {
    super(message);
  }
}

// Same-origin API: Express forwards requests to local Spring Boot.
export async function authRequest(
  path: string,
  body: Record<string, string>,
): Promise<{ message?: string; userId?: number; sessionToken?: string }> {
  // Waited for any previous logout before creating a new login cookie, avoiding
  // a delayed logout response clearing the session that had just been created.
  await finishLogout();
  const response = await fetch(`/api/v1/auth/${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok)
    throw new AuthError(
      data.message || 'The request could not be completed. Please try again.',
      response.status,
      data.userId,
    );
  return data;
}
export function formError(error: unknown): string {
  return error instanceof TypeError ||
    (error instanceof DOMException && error.name === 'TimeoutError')
    ? 'Unable to reach FinApp. Check that the application is running and try again.'
    : error instanceof Error
      ? error.message
      : 'Something went wrong. Please try again.';
}
