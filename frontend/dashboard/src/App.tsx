import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArchetypeGraph } from './graphs';
import type { View } from './finance';
import { demoProfile, API_BASE } from './finance';
import { endSession, sessionHeaders } from './session';
import {
  DEFAULT_DEMO_HOLDINGS,
  notifyPortfolioUpdated,
  parseLocalHoldings,
  saveLocalHoldings,
} from './portfolio';
import { useTheme } from './useTheme';
import type { UserProfile } from './components/SettingsTab';

const DEMO_PROFILES: Record<number, UserProfile> = {
  1: { username: 'alex_grad', displayName: 'Alex Rivera (Recent Grad)', profilePicture: null },
  2: { username: 'the_millers', displayName: 'The Miller Family', profilePicture: null },
  3: { username: 'jordan_fire', displayName: 'Jordan Vance (FIRE Strategist)', profilePicture: null },
};

// Kept workspace navigation separate from account settings.
const views: {
  id: View;
  label: string;
  icon: string;
}[] = [
  { id: 'overview', label: 'Overview', icon: '◫' },
  { id: 'graph', label: 'Node Graph', icon: '⌘' },
  { id: 'cashflow', label: 'Cash flow', icon: '⇄' },
  { id: 'budgeting', label: 'Budgeting', icon: '▤' },
  { id: 'investing', label: 'Investments', icon: '↗' },
  { id: 'ai', label: 'AI Coach', icon: '✦' },
];
export default function App() {
  const { theme, selectTheme } = useTheme();
  const params = new URLSearchParams(location.search);
  const demo = params.get('demo') === 'true';
  const initialDemoProfile = demoProfile(params.get('profile'));
  const userId = Number(sessionStorage.getItem('finapp_user_id')) || 0;
  // Scoped the selected demo profile independently from the signed-in user;
  // the query parameter selected examples without changing account ownership.
  const [profile, setProfile] = useState(demo ? initialDemoProfile : userId);
  const [view, setView] = useState<View>(() => {
    const requested = params.get('view');
    if (requested === 'settings') return requested;
    return views.find(({ id }) => id === requested)?.id ?? 'overview';
  });
  const [search, setSearch] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountMenu = useRef<HTMLDivElement>(null);
  const accountButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!accountOpen) return;
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !accountMenu.current?.contains(event.target)) {
        setAccountOpen(false);
      }
    }
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [accountOpen]);
  const [profileStatus, setProfileStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [profileRequest, retryProfile] = useState(0);
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    if (demo) {
      try {
        const saved = localStorage.getItem(`finapp-demo-profile:${initialDemoProfile || 1}`);
        if (saved) return { ...JSON.parse(saved), profilePicture: null };
      } catch {}
      return DEMO_PROFILES[initialDemoProfile || 1] || DEMO_PROFILES[2];
    }
    return {
      id: userId,
      username: 'user' + userId,
      displayName: 'User ' + userId,
      profilePicture: null,
    };
  });
  // Reset the page position before the newly selected tab was painted.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [view]);
  useEffect(() => {
    if (demo) {
      try {
        const saved = localStorage.getItem(`finapp-demo-profile:${profile}`);
        if (saved) {
          setUserProfile({ ...JSON.parse(saved), profilePicture: null });
          return;
        }
      } catch {}
      setUserProfile(DEMO_PROFILES[profile] || DEMO_PROFILES[2]);
    } else if (userId) {
      // Kept editing locked until the account fields were loaded successfully.
      const controller = new AbortController();
      setProfileStatus('loading');
      fetch(`${API_BASE}/users/me`, {
        headers: sessionHeaders(),
        credentials: 'include',
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) throw new Error('Profile could not be loaded.');
          const { data } = await res.json();
          if (controller.signal.aborted) return;
          setUserProfile({
            id: data.id,
            username: data.username,
            email: data.email,
            displayName: data.displayName || data.username,
            profilePicture: data.profilePicture || null,
          });
          setProfileStatus('ready');
        })
        .catch(() => {
          if (!controller.signal.aborted) setProfileStatus('error');
        });
      return () => controller.abort();
    }
  }, [demo, profile, userId, profileRequest]);
  useEffect(() => {
    if (!demo && !userId) location.replace('/login');
    if (!demo && userId) {
      fetch(`${API_BASE}/stocks/refresh-prices`, {
        method: 'POST',
        headers: sessionHeaders(),
        credentials: 'include',
      })
        .then(() => {
          notifyPortfolioUpdated();
        })
        .catch(() => {});
    } else if (demo) {
      const storageKey = `finapp-holdings-v1:demo:${initialDemoProfile || 1}`;
      const rawStorage = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;
      const holdingsToRefresh =
        rawStorage === null
          ? (DEFAULT_DEMO_HOLDINGS[initialDemoProfile || 1] || DEFAULT_DEMO_HOLDINGS[1])
          : parseLocalHoldings(storageKey);
      const tickers = Array.from(
        new Set(holdingsToRefresh.map((h) => h.symbol.trim().toUpperCase())),
      ).filter(Boolean);
      if (tickers.length > 0) {
        Promise.allSettled(
          tickers.map(async (ticker) => {
            const res = await fetch(`${API_BASE}/market/stocks/${encodeURIComponent(ticker)}`);
            if (!res.ok) return null;
            const data = await res.json().catch(() => null);
            return data && typeof data.latest_price === 'number'
              ? { ticker, price: data.latest_price }
              : null;
          }),
        )
          .then((results) => {
            const priceMap: Record<string, number> = {};
            results.forEach((r) => {
              if (r.status === 'fulfilled' && r.value) {
                priceMap[r.value.ticker] = r.value.price;
              }
            });
            if (Object.keys(priceMap).length > 0) {
              // Merged late quotes into current holdings so deleted positions stayed deleted.
              const latestHoldings = localStorage.getItem(storageKey) === null
                ? holdingsToRefresh
                : parseLocalHoldings(storageKey);
              const updated = latestHoldings.map((h) => {
                const p = priceMap[h.symbol.toUpperCase()];
                return p !== undefined ? { ...h, lastPrice: p } : h;
              });
              saveLocalHoldings(storageKey, updated);
              notifyPortfolioUpdated();
            }
          })
          .catch(() => {});
      }
    }
  }, [demo, userId, initialDemoProfile]);
  function openView(next: View) {
    // Stored the view in the current URL so reloads kept their place and fresh entries opened Overview.
    const url = new URL(location.href);
    if (next === 'overview') url.searchParams.delete('view');
    else url.searchParams.set('view', next);
    history.replaceState(history.state, '', url);
    setSearch('');
    setAccountOpen(false);
    setView(next);
  }
  if (!demo && !userId) return null;
  return (
    <div className="flex min-h-dvh max-[760px]:block">
      <aside id="workspace-sidebar" className={`w-54 shrink-0 border-r border-border p-[30px_18px] flex-col bg-raised sticky top-0 h-dvh max-[760px]:static max-[760px]:h-auto max-[760px]:w-full max-[760px]:px-4 max-[760px]:pt-3.75 max-[760px]:pb-2.25 max-[760px]:border-r-0 max-[760px]:border-b max-[760px]:border-border ${sidebarOpen ? 'flex' : 'hidden'}`}>
        <a className="text-[25px] font-bold flex items-center gap-2.25 px-3 tracking-[-1px] text-text max-[760px]:text-[22px] max-[760px]:p-0" href="/">
          <span className="block shrink-0 w-8 h-8 rounded-full bg-brand max-[760px]:w-7 max-[760px]:h-7" aria-hidden="true" />
          FinApp
        </a>
        <div className="text-[9px] tracking-[1.6px] text-subtle m-[51px_14px_14px] max-[760px]:hidden">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation" className="max-[760px]:flex max-[760px]:gap-1.25 max-[760px]:mt-3.5 max-[760px]:overflow-auto">
          {views.map((item) => (
            <button
              key={item.id}
              // Kept active and inactive colors exclusive so generated CSS order could not hide selection.
              className={`border flex items-center text-left gap-3 rounded-lg p-3 w-full my-0.75 text-[13px] cursor-pointer transition-colors duration-150 max-[760px]:w-auto max-[760px]:whitespace-nowrap max-[760px]:text-[11px] max-[760px]:px-2.75 max-[760px]:py-2.25 max-[760px]:gap-1.75 ${view === item.id ? 'active bg-active-bg text-active-text border-active-border' : 'border-transparent bg-transparent text-(--ui-text-98a6bc) hover:bg-hover-bg hover:text-(--ui-text-edf2fa)'}`}
              aria-current={view === item.id ? 'page' : undefined}
              onClick={() => openView(item.id)}
            >
              <span className="text-[19px] w-5 text-center max-[760px]:text-[15px] max-[760px]:w-3.5" aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        {/* Opened help in a separate tab so the current workspace session stayed open. */}
        <a className="workspace-sidebar-help" href="/faq" target="_blank" rel="noopener noreferrer" aria-label="Help center, opens in a new tab">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9a2.5 2.5 0 1 1 3.7 2.2c-.8.5-1.2 1-1.2 1.8m0 3h.01" />
          </svg>
          <span><strong>Help center</strong><small>Guides and answers</small></span>
          <span className="workspace-help-arrow" aria-hidden="true">↗</span>
        </a>
      </aside>
      <main className="flex-1 min-w-0">
        <header className="h-18.5 flex gap-5 items-center px-8 border-b border-border bg-header max-[760px]:h-15 max-[760px]:px-4 max-[760px]:gap-2.5">
          <button
            type="button"
            className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border text-muted transition-colors hover:bg-hover-bg hover:text-text"
            aria-controls="workspace-sidebar"
            aria-expanded={sidebarOpen}
            aria-label={sidebarOpen ? 'Hide workspace navigation' : 'Show workspace navigation'}
            title={sidebarOpen ? 'Hide workspace navigation' : 'Show workspace navigation'}
            onClick={() => setSidebarOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="size-5" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <path d="M9 4v16" />
            </svg>
          </button>
          <div className="text-xs text-(--ui-text-7f8ea5) flex-1 max-[760px]:hidden">
            Workspace <span className="mx-2.5 text-(--ui-text-4b5971)">/</span> <strong className="text-(--ui-text-bac5d7) font-medium">{view === 'settings' ? 'Settings' : views.find((v) => v.id === view)?.label}</strong>
          </div>
          {/* Shown only where the current view supplied a list or graph to search. */}
          {(view === "graph" || view === "cashflow" || view === "investing") && <label className="min-w-0 flex items-center gap-2.25 text-(--ui-text-8f9db3) bg-(--ui-surface-151c29) border border-(--ui-border-293246) rounded-[7px] px-2.5 w-60 max-[760px]:flex-1 max-[760px]:w-auto">
            <span className="text-[23px]" aria-hidden="true">⌕</span>
            <input
              className="min-w-0 border-0 bg-transparent py-2.25 px-0 w-full text-xs outline-none text-text"
              aria-label={view === "graph" ? "Search nodes" : view === "cashflow" ? "Search flows" : "Search scenario accounts"}
              placeholder={view === "graph" ? "Find a node…" : view === "cashflow" ? "Find a flow…" : "Find a scenario account…"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="border-0 bg-transparent text-(--ui-text-a3afc2) cursor-pointer" aria-label="Clear search" onClick={() => setSearch('')}>
                ×
              </button>
            )}
          </label>}
          <div
            ref={accountMenu}
            className="relative shrink-0 max-[760px]:ml-auto"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setAccountOpen(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && accountOpen) {
                event.stopPropagation();
                setAccountOpen(false);
                accountButton.current?.focus();
              }
            }}
          >
            <button
              type="button"
              ref={accountButton}
              className={`inline-flex min-h-8.5 items-center gap-2 rounded-lg px-2.5 text-sm font-medium cursor-pointer transition-colors ${
                accountOpen || view === 'settings' ? 'bg-active-bg text-active-text' : 'text-muted hover:bg-hover-bg hover:text-text'
              }`}
              aria-label="User profile and settings"
              title="User profile and settings"
              aria-expanded={accountOpen}
              aria-controls={accountOpen ? 'workspace-account-options' : undefined}
              onClick={() => setAccountOpen((open) => !open)}
            >
              {userProfile.profilePicture ? (
                <img
                  src={userProfile.profilePicture}
                  alt=""
                  className="size-6 shrink-0 rounded-full object-cover"
                />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className="size-5 shrink-0" aria-hidden="true">
                  <circle cx="12" cy="8" r="3.25" />
                  <path d="M5 20v-1a7 7 0 0 1 14 0v1" />
                </svg>
              )}
              <span className="max-w-36 truncate max-[500px]:max-w-24">
                {userProfile.displayName || userProfile.username || 'Profile'}
              </span>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-3 shrink-0" aria-hidden="true">
                <path d="m4 6 4 4 4-4" />
              </svg>
            </button>
            {accountOpen && (
              <div id="workspace-account-options" className="absolute right-0 top-full z-30 mt-2 w-52 space-y-1 rounded-xl border border-border bg-surface p-1.5 shadow-lg">
                <button
                  type="button"
                  className="block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm text-text hover:bg-hover-bg"
                  aria-current={view === 'overview' ? 'page' : undefined}
                  onClick={() => {
                    openView('overview');
                    accountButton.current?.focus();
                  }}
                >
                  Workspace overview
                </button>
                <button
                  type="button"
                  className="block w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm text-text hover:bg-hover-bg"
                  aria-current={view === 'settings' ? 'page' : undefined}
                  onClick={() => {
                    openView('settings');
                    accountButton.current?.focus();
                  }}
                >
                  Settings
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className="inline-flex shrink-0 items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-transparent border border-transparent text-(--ui-text-a4b2c9) hover:bg-(--ui-surface-hover-232f43) hover:text-text"
            onClick={async () => {
              if (!demo) await endSession();
              location.replace(demo ? '/' : '/login');
            }}
          >
            {demo ? 'Exit demo' : 'Sign out'} ↗
          </button>
        </header>
        {(view === "overview" || demo) && <div className="p-[29px_32px_24px] flex justify-between items-center gap-5 max-[760px]:items-start max-[760px]:p-[23px_16px_18px] max-[760px]:flex-col max-[760px]:gap-4">
          {view === "overview" && <div>
            <div className="text-[9px] text-(--ui-text-a9b7ce) tracking-[1.7px] font-semibold mb-2.5">
              {demo ? 'EXPLORE A FINANCIAL SCENARIO' : 'YOUR FINANCIAL WORKSPACE'}
            </div>
            <h1 className="text-[clamp(22px,2.5vw,32px)] font-semibold tracking-[-1px] leading-tight text-text m-0 max-[760px]:text-[25px]">Your money. A clearer picture.</h1>
            <p className="text-xs text-(--ui-text-8998b0) mt-2 leading-relaxed">Connect the everyday decisions to the bigger plan.</p>
          </div>}
          {demo && (
            <div className="ms-auto flex gap-2.5 items-center shrink-0 max-[760px]:w-full">
              <span className="text-[9px] tracking-[1px] border border-(--ui-border-705822) text-(--ui-text-e8c67a) rounded px-1.75 py-1.25">DEMO</span>
              <label className="sr-only" htmlFor="profile">
                Demo profile
              </label>
              <select
                id="profile"
                className="text-xs min-w-45 bg-(--ui-surface-171e2b) border border-border rounded-lg text-(--ui-text-edf2fa) px-2.75 py-2.5 cursor-pointer max-[760px]:flex-1"
                value={profile}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setProfile(next);
                  const url = new URL(location.href);
                  url.searchParams.set('profile', String(next));
                  history.replaceState(history.state, '', url);
                }}
              >
                <option value={1}>Recent Grad</option>
                <option value={2}>Mid-Career Family</option>
                <option value={3}>FIRE Strategist</option>
              </select>
            </div>
          )}
        </div>}
        <ArchetypeGraph
          key={`${demo}-${profile}`}
          userId={profile}
          demo={demo}
          view={view}
          search={search}
          userProfile={userProfile}
          profileStatus={demo ? 'ready' : profileStatus}
          onRetryProfile={() => retryProfile((attempt) => attempt + 1)}
          onUpdateProfile={setUserProfile}
          activeTheme={theme}
          onSelectTheme={selectTheme}
          onNavigate={openView}
        />
      </main>
    </div>
  );
}
