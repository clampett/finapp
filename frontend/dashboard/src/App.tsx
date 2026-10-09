import { useState } from 'react';
import { ArchetypeGraph } from './graphs.tsx';

export default function App() {
  // State to track which archetype is active (defaults to 1)
  const [activeArchetype, setActiveArchetype] = useState(1);

  return (
    <div className="flex h-screen w-screen bg-[#111115] text-white font-sans overflow-hidden">
      
      {/* SIDEBAR (Kept identical to your previous code) */}
      <aside className="w-64 bg-[#1A1A1F] border-r border-gray-800 flex flex-col justify-between">
        <div>
          <div className="h-20 flex items-center px-6 border-b border-gray-800">
            <div className="w-6 h-6 rounded-full bg-teal-400 mr-3"></div>
            <h1 className="text-xl font-bold tracking-wide">FinApp</h1>
          </div>
          <nav className="mt-6 px-4 space-y-2">
            <a href="#" className="flex items-center px-4 py-3 text-gray-400 hover:bg-gray-800 hover:text-white rounded-lg transition-colors"><span className="mr-3">⊞</span> Overview</a>
            <a href="#" className="flex items-center px-4 py-3 text-gray-400 hover:bg-gray-800 hover:text-white rounded-lg transition-colors"><span className="mr-3">◎</span> Budgeting</a>
            <a href="#" className="flex items-center px-4 py-3 text-gray-400 hover:bg-gray-800 hover:text-white rounded-lg transition-colors"><span className="mr-3">📈</span> Investing</a>
            <a href="#" className="flex items-center px-4 py-3 bg-gray-800 text-white rounded-lg shadow-sm border border-gray-700"><span className="mr-3 text-teal-400">⚯</span> Node Graph</a>
          </nav>
        </div>
        <div className="p-4 border-t border-gray-800 space-y-2">
          <a href="#" className="flex items-center px-4 py-3 text-gray-400 hover:text-white transition-colors"><span className="mr-3">👤</span> Profile</a>
          <a href="#" className="flex items-center px-4 py-3 text-gray-400 hover:text-white transition-colors"><span className="mr-3">⚙️</span> Settings</a>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 flex flex-col h-full relative">
        <header className="h-20 flex items-center justify-between px-8 bg-[#111115]">
          <div className="w-96 bg-[#1A1A1F] rounded-full px-4 py-2 flex items-center border border-gray-800">
            <span className="text-gray-500 mr-2">🔍</span>
            <input type="text" placeholder="Search..." className="bg-transparent border-none outline-none text-sm w-full text-white placeholder-gray-500" />
          </div>
          <div className="flex items-center space-x-6 text-gray-400">
            <span className="cursor-pointer hover:text-white">🔔</span>
            <div className="w-8 h-8 rounded-full bg-gray-600 cursor-pointer"></div>
            <a href="/" className="text-sm text-indigo-400 hover:text-indigo-300">Logout</a>
          </div>
        </header>

        {/* ARCHETYPE TOGGLE MENU */}
        <div className="px-8 pt-6 flex space-x-4">
          <button 
            onClick={() => setActiveArchetype(1)}
            className={`px-4 py-2 rounded-md font-semibold text-sm transition-colors ${activeArchetype === 1 ? 'bg-teal-500 text-white' : 'bg-[#1A1A1F] text-gray-400 hover:text-white border border-gray-800'}`}>
            Archetype 1: Recent Grad
          </button>
          <button 
            onClick={() => setActiveArchetype(2)}
            className={`px-4 py-2 rounded-md font-semibold text-sm transition-colors ${activeArchetype === 2 ? 'bg-teal-500 text-white' : 'bg-[#1A1A1F] text-gray-400 hover:text-white border border-gray-800'}`}>
            Archetype 2: Mid-Career Family
          </button>
          <button 
            onClick={() => setActiveArchetype(3)}
            className={`px-4 py-2 rounded-md font-semibold text-sm transition-colors ${activeArchetype === 3 ? 'bg-teal-500 text-white' : 'bg-[#1A1A1F] text-gray-400 hover:text-white border border-gray-800'}`}>
            Archetype 3: Fire Strategist
          </button>
        </div>

        {/* D3 Graph Canvas */}
        <div className="flex-1 p-8 overflow-hidden relative" id="d3-container">
           {/* Pass the active state down as a prop so D3 fetches the new ID */}
           <ArchetypeGraph userId={activeArchetype} />
        </div>
      </main>
    </div>
  );
}