import { useEffect, useState } from 'react';
import { ArchetypeGraph } from './graphs';
import type { View } from './finance';
import { demoProfile, API_BASE } from './finance';
import { endSession, sessionHeaders } from './session';
// Defined navigation labels in one place so the sidebar and breadcrumb were
// derived from the same selected view rather than separate UI state.
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
];
export default function App() {
  const params = new URLSearchParams(location.search);
  const demo = params.get('demo') === 'true';
  const initialDemoProfile = demoProfile(params.get('profile'));
  const userId = Number(sessionStorage.getItem('finapp_user_id')) || 0;
  // Scoped the selected demo profile independently from the signed-in user;
  // the query parameter selected examples without changing account ownership.
  const [profile, setProfile] = useState(demo ? initialDemoProfile : userId);
  const [view, setView] = useState<View>('overview');
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (!demo && !userId) location.replace('/login');
    if (!demo && userId) {
      fetch(`${API_BASE}/stocks/refresh-prices`, {
        method: 'POST',
        headers: sessionHeaders(),
        credentials: 'include',
      }).catch(() => {});
    }
  }, [demo, userId]);
  if (!demo && !userId) return null;
  return (
    <div className="flex min-h-dvh max-[760px]:block">
      <aside className="w-54 shrink-0 border-r border-border p-[30px_18px] flex flex-col bg-raised sticky top-0 h-dvh max-[760px]:static max-[760px]:h-auto max-[760px]:w-full max-[760px]:px-4 max-[760px]:pt-3.75 max-[760px]:pb-2.25 max-[760px]:border-r-0 max-[760px]:border-b max-[760px]:border-border">
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
              className={`border flex items-center text-left gap-3 rounded-lg p-3 w-full my-0.75 text-[13px] cursor-pointer transition-colors duration-150 max-[760px]:w-auto max-[760px]:whitespace-nowrap max-[760px]:text-[11px] max-[760px]:px-2.75 max-[760px]:py-2.25 max-[760px]:gap-1.75 ${view === item.id ? 'active bg-active-bg text-active-text border-active-border' : 'border-transparent bg-transparent text-[#98a6bc] hover:bg-hover-bg hover:text-[#edf2fa]'}`}
              aria-current={view === item.id ? 'page' : undefined}
              onClick={() => setView(item.id)}
            >
              <span className="text-[19px] w-5 text-center max-[760px]:text-[15px] max-[760px]:w-3.5" aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto text-[10px] text-[#9aabc1] pt-5 px-2.5 pb-0 max-[760px]:hidden">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#73d9af] align-middle mr-1.75" /> Personal finance, connected.
          <p className="text-[10px] text-[#63748e] mt-2">Build a scenario. See the possibilities.</p>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <header className="h-18.5 flex gap-5 items-center px-8 border-b border-border bg-header max-[760px]:h-15 max-[760px]:px-4 max-[760px]:gap-2.5">
          <div className="text-xs text-[#7f8ea5] flex-1 max-[760px]:hidden">
            Workspace <span className="mx-2.5 text-[#4b5971]">/</span> <strong className="text-[#bac5d7] font-medium">{views.find((v) => v.id === view)?.label}</strong>
          </div>
          <label className="flex items-center gap-2.25 text-[#8f9db3] bg-[#151c29] border border-[#293246] rounded-[7px] px-2.5 w-60 max-[760px]:flex-1 max-[760px]:w-auto">
            <span className="text-[23px]" aria-hidden="true">⌕</span>
            <input
              className="border-0 bg-transparent py-2.25 px-0 w-full text-xs outline-none text-text"
              aria-label="Search nodes"
              placeholder="Find a node…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="border-0 bg-transparent text-[#a3afc2] cursor-pointer" aria-label="Clear search" onClick={() => setSearch('')}>
                ×
              </button>
            )}
          </label>
          <button
            className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 font-medium text-[11px] min-h-8.5 cursor-pointer bg-transparent border border-transparent text-[#a4b2c9] hover:bg-[#232f43] hover:text-text"
            onClick={async () => {
              await endSession();
              location.replace(demo ? '/' : '/login');
            }}
          >
            {demo ? 'Exit demo' : 'Sign out'} ↗
          </button>
        </header>
        <div className="p-[29px_32px_24px] flex justify-between items-center gap-5 max-[760px]:items-start max-[760px]:p-[23px_16px_18px] max-[760px]:flex-col max-[760px]:gap-4">
          <div>
            <div className="text-[9px] text-[#a9b7ce] tracking-[1.7px] font-semibold mb-2.5">
              {demo ? 'EXPLORE A FINANCIAL SCENARIO' : 'YOUR FINANCIAL WORKSPACE'}
            </div>
            <h1 className="text-[clamp(22px,2.5vw,32px)] font-semibold tracking-[-1px] leading-tight text-text m-0 max-[760px]:text-[25px]">Your money. A clearer picture.</h1>
            <p className="text-xs text-[#8998b0] mt-2 leading-relaxed">Connect the everyday decisions to the bigger plan.</p>
          </div>
          {demo && (
            <div className="flex gap-2.5 items-center shrink-0 max-[760px]:w-full">
              <span className="text-[9px] tracking-[1px] border border-[#705822] text-[#e8c67a] rounded px-1.75 py-1.25">DEMO</span>
              <label className="sr-only" htmlFor="profile">
                Demo profile
              </label>
              <select
                id="profile"
                className="text-xs min-w-45 bg-[#171e2b] border border-border rounded-lg text-[#edf2fa] px-2.75 py-2.5 cursor-pointer max-[760px]:flex-1"
                value={profile}
                onChange={(e) => {
                  const next = Number(e.target.value);
                  setProfile(next);
                  const url = new URL(location.href);
                  url.searchParams.set('profile', String(next));
                  history.replaceState(null, '', url);
                }}
              >
                <option value={1}>Recent Grad</option>
                <option value={2}>Mid-Career Family</option>
                <option value={3}>FIRE Strategist</option>
              </select>
            </div>
          )}
        </div>
        <ArchetypeGraph
          key={`${demo}-${profile}`}
          userId={profile}
          demo={demo}
          view={view}
          search={search}
        />
      </main>
    </div>
  );
}
