import { ArchetypeGraph } from './graphs.tsx'

export default function App() {
  console.log("loaded dashboard")
  return (
    <div className="min-h-screen bg-white p-8">
      <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
      <p className="mt-2 text-slate-600">You made it in!</p>
      {/* Render the ArchetypeGraph component */}
      <div className="mt-8">
        <ArchetypeGraph userId={1} />
      </div>
      <a href="/" className="mt-6 inline-block text-indigo-600 underline">
        Back to home
      </a>
    </div>
  );
}