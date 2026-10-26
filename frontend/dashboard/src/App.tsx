import { useEffect, useState } from 'react';
import { ArchetypeGraph } from './graphs';
import type { View } from './finance';
import { demoProfile } from './finance';
import { endSession } from './session';
// Defined navigation labels in one place so the sidebar and breadcrumb were
// derived from the same selected view rather than separate UI state.
const views: {
  id: View;
  label: string;
  icon: string;
}[] = [
  { id: 'overview', label: 'Overview', icon: '◫' },
  { id: 'graph', label: 'Node Graph', icon: '⌘' },
  { id: 'budgeting', label: 'Cash flow', icon: '⇄' },
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
  }, [demo, userId]);
  if (!demo && !userId) return null;
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true" />
          FinApp
        </a>
        <div className="nav-caption">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          {views.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? 'active' : ''}`}
              aria-current={view === item.id ? 'page' : undefined}
              onClick={() => setView(item.id)}
            >
              <span aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" /> Personal finance, connected.
          <p>Build a scenario. See the possibilities.</p>
        </div>
      </aside>
      <main className="app-main">
        <header className="app-header">
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>{views.find((v) => v.id === view)?.label}</strong>
          </div>
          <label className="search-field">
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Search nodes"
              placeholder="Find a node…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button aria-label="Clear search" onClick={() => setSearch('')}>
                ×
              </button>
            )}
          </label>
          <button
            className="button quiet"
            onClick={async () => {
              await endSession();
              location.replace(demo ? '/' : '/login');
            }}
          >
            {demo ? 'Exit demo' : 'Sign out'} ↗
          </button>
        </header>
        <div className="workspace-heading">
          <div>
            <div className="eyebrow">
              {demo ? 'EXPLORE A FINANCIAL SCENARIO' : 'YOUR FINANCIAL WORKSPACE'}
            </div>
            <h1>Your money. A clearer picture.</h1>
            <p>Connect the everyday decisions to the bigger plan.</p>
          </div>
          {demo && (
            <div className="profile-switcher">
              <span className="demo-badge">DEMO</span>
              <label className="sr-only" htmlFor="profile">
                Demo profile
              </label>
              <select
                id="profile"
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
