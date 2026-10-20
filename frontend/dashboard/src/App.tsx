import { useState, useEffect } from 'react';
import { ArchetypeGraph } from './graphs.tsx';

export default function App() {
  const searchParams = new URLSearchParams(window.location.search);
  const isDemoMode = searchParams.get('demo') === 'true';

  // 1. ROUTE GUARD: Kick unauthenticated users out immediately
  useEffect(() => {
    const loggedInUserId = sessionStorage.getItem('finapp_user_id');
    if (!isDemoMode && !loggedInUserId) {
      window.location.replace('/login.html');
    }
  }, [isDemoMode]);

  // 2. SECURE LOGOUT HANDLERS
  const handleLogout = () => {
    sessionStorage.removeItem('finapp_user_id');
    window.location.replace('/login.html');
  };

  const handleExitDemo = () => {
    window.location.replace('/');
  };

  const realUserId = Number(sessionStorage.getItem('finapp_user_id')) || 0;
  const [activeArchetype, setActiveArchetype] = useState(isDemoMode ? 1 : realUserId);

  // If we are redirecting, render nothing to prevent a flash of the dashboard
  if (!isDemoMode && !sessionStorage.getItem('finapp_user_id')) {
    return null; 
  }

  return (
    <div className="flex h-screen w-screen bg-[#111115] text-white font-sans overflow-hidden">
      
      {/* SIDEBAR */}
      <aside className="w-80 bg-[#1A1A1F] border-r border-gray-800 flex flex-col justify-between">
        <div>
          <div className="h-24 flex items-center px-8 border-b border-gray-800">
            <div className="w-8 h-8 rounded-full bg-teal-400 mr-4"></div>
            <h1 className="text-2xl font-bold tracking-wide">FinApp</h1>
          </div>
          <nav className="mt-8 px-6 space-y-3">
            <a href="#" className="flex items-center px-5 py-4 text-lg text-gray-400 hover:bg-gray-800 hover:text-white rounded-xl transition-colors"><span className="mr-4 text-xl">⊞</span> Overview</a>
            <a href="#" className="flex items-center px-5 py-4 text-lg text-gray-400 hover:bg-gray-800 hover:text-white rounded-xl transition-colors"><span className="mr-4 text-xl">◎</span> Budgeting</a>
            <a href="#" className="flex items-center px-5 py-4 text-lg text-gray-400 hover:bg-gray-800 hover:text-white rounded-xl transition-colors"><span className="mr-4 text-xl">📈</span> Investing</a>
            <a href="#" className="flex items-center px-5 py-4 text-lg bg-gray-800 text-white rounded-xl shadow-sm border border-gray-700"><span className="mr-4 text-xl text-indigo-400">⚯</span> Node Graph</a>
          </nav>
        </div>
        <div className="p-6 border-t border-gray-800 space-y-3">
          <a href="#" className="flex items-center px-5 py-4 text-lg text-gray-400 hover:text-white transition-colors"><span className="mr-4 text-xl">👤</span> Profile</a>
          <a href="#" className="flex items-center px-5 py-4 text-lg text-gray-400 hover:text-white transition-colors"><span className="mr-4 text-xl">⚙️</span> Settings</a>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col h-full relative">
        <header className="h-24 flex items-center justify-between px-10 bg-[#111115]">
          <div className="w-[28rem] bg-[#1A1A1F] rounded-full px-6 py-3 flex items-center border border-gray-800">
            <span className="text-gray-500 mr-3 text-lg">🔍</span>
            <input type="text" placeholder="Search..." className="bg-transparent border-none outline-none text-base w-full text-white placeholder-gray-500" />
          </div>
          <div className="flex items-center space-x-8 text-gray-400">
            <span className="cursor-pointer hover:text-white text-xl">🔔</span>
            <div className="w-10 h-10 rounded-full bg-gray-600 cursor-pointer"></div>
            {/* Dynamic Logout / Exit Demo Button */}
            <button onClick={isDemoMode ? handleExitDemo : handleLogout} className="text-base font-semibold text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer">
              {isDemoMode ? "Exit Demo" : "Logout"}
            </button>
          </div>
        </header>

        {/* CONDITIONAL ARCHETYPE TOGGLE MENU */}
        {isDemoMode && (
          <div className="px-10 pt-8 flex items-center space-x-6">
            <span className="px-3 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold rounded-full uppercase tracking-wider">Demo Mode</span>
            <button 
              onClick={() => setActiveArchetype(1)}
              className={`px-6 py-3 rounded-lg font-bold text-base transition-colors ${activeArchetype === 1 ? 'bg-blue-600 text-white border border-blue-500 shadow-md' : 'bg-[#1A1A1F] text-gray-400 hover:text-white border border-gray-800'}`}>
              Archetype 1: Recent Grad
            </button>
            <button 
              onClick={() => setActiveArchetype(2)}
              className={`px-6 py-3 rounded-lg font-bold text-base transition-colors ${activeArchetype === 2 ? 'bg-blue-600 text-white border border-blue-500 shadow-md' : 'bg-[#1A1A1F] text-gray-400 hover:text-white border border-gray-800'}`}>
              Archetype 2: Mid-Career Family
            </button>
            <button 
              onClick={() => setActiveArchetype(3)}
              className={`px-6 py-3 rounded-lg font-bold text-base transition-colors ${activeArchetype === 3 ? 'bg-blue-600 text-white border border-blue-500 shadow-md' : 'bg-[#1A1A1F] text-gray-400 hover:text-white border border-gray-800'}`}>
              Archetype 3: FIRE Strategist
            </button>
          </div>
        )}

        {/* D3 Graph Canvas */}
        <div className="flex-1 p-10 overflow-hidden relative" id="d3-container">
           <ArchetypeGraph userId={activeArchetype} />
        </div>
      </main>
    </div>
  );
}