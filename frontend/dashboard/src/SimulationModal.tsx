import { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const PYTHON_API_URL = 'http://localhost:5000/api/simulate';

const formatAxisValue = (value: number) => {
  if (value === 0) return "$0";
  const absVal = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (absVal >= 1000000) return `${sign}$${Number((absVal / 1000000).toFixed(1))}M`;
  if (absVal >= 1000) return `${sign}$${Number((absVal / 1000).toFixed(1))}k`;
  return `${sign}$${absVal}`;
};

const formatTooltipValue = (value: any) => {
  const num = Number(value);
  const isNegative = num < 0;
  return [`${isNegative ? '-' : ''}$${Math.abs(num).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, ""];
};

export function SimulationModal({ graphData, onClose }: { graphData: any, onClose: () => void }) {
  const [forecast, setForecast] = useState<any[] | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [savingsRate, setSavingsRate] = useState<number>(100);
  const [isInflationAdjusted, setIsInflationAdjusted] = useState<boolean>(false);

  let totalIncome = 0;
  let totalExpense = 0;
  graphData.nodes.forEach((node: any) => {
    const val = Number(node.amountOrBalance) || 0;
    const type = String(node.nodeType || '').toUpperCase();
    if (type === 'INCOME') totalIncome += val;
    else if (type === 'EXPENSE') totalExpense += val;
    else if (type === 'DEBT') totalExpense += (val * 0.01); 
  });
  
  const currentNetCashFlow = totalIncome - totalExpense;
  const activeInvestedAmount = currentNetCashFlow > 0 ? currentNetCashFlow * (savingsRate / 100) : 0;

  const runSimulation = async (overrideRate?: number, overrideInflation?: boolean) => {
    setIsSimulating(true);
    try {
      const rateToUse = overrideRate !== undefined ? overrideRate : savingsRate;
      const inflationToUse = overrideInflation !== undefined ? overrideInflation : isInflationAdjusted;
      
      const payload = {
        investment_rate: rateToUse,
        inflation_rate: inflationToUse ? 0.025 : 0.0,
        nodes: graphData.nodes.map((node: any) => ({
          id: String(node.id),
          type: String(node.nodeType || 'default').toUpperCase(),
          balance: Math.abs(Number(node.amountOrBalance) || 0)
        })),
        edges: []
      };

      const response = await fetch(PYTHON_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (data.status === "success") setForecast(data.forecast);
    } catch (error) {
      console.error("Simulation failed:", error);
    } finally {
      setIsSimulating(false);
    }
  };

  useEffect(() => { runSimulation(); }, []);

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 sm:p-8">
      <div className="bg-[#111116] border border-gray-800 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto relative flex flex-col lg:flex-row">
        
        <button onClick={onClose} className="absolute top-4 right-4 z-30 text-gray-400 hover:text-white bg-gray-800/50 hover:bg-gray-700 rounded-full w-8 h-8 flex items-center justify-center transition-colors">✕</button>

        <div className="flex-1 p-6 lg:p-8 border-b lg:border-b-0 lg:border-r border-gray-800 flex flex-col min-h-[400px]">
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-1">Lifetime Wealth Projection</h2>
          <p className="text-xs sm:text-sm text-gray-400 mb-6">Monte Carlo statistical analysis projecting 30 years of market volatility.</p>
          
          <div className="flex-1 w-full relative">
            {isSimulating && !forecast ? (
              <div className="absolute inset-0 flex items-center justify-center text-indigo-400 font-bold">Running AI Forecast...</div>
            ) : forecast ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={forecast} margin={{ top: 10, right: 10, left: 30, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorP90" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                    <linearGradient id="colorP50" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/><stop offset="95%" stopColor="#6366f1" stopOpacity={0}/></linearGradient>
                  </defs>
                  <XAxis dataKey="year" stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis stroke="#6b7280" tick={{ fill: '#9ca3af', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={formatAxisValue} />
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '12px', color: '#fff', fontSize: '14px' }} formatter={formatTooltipValue} />
                  <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ paddingBottom: '10px', fontSize: '14px' }}/>
                  <Area type="monotone" dataKey="p90" name="Top 10% (Bull)" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorP90)" />
                  <Area type="monotone" dataKey="p50" name="Median (Expected)" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorP50)" />
                  <Area type="monotone" dataKey="p10" name="Bottom 10% (Bear)" stroke="#ef4444" strokeWidth={2} fill="transparent" />
                </AreaChart>
              </ResponsiveContainer>
            ) : null}
          </div>
        </div>

        <div className="w-full lg:w-96 p-6 lg:p-8 bg-[#1A1A1F] flex flex-col shrink-0">
          <h3 className="text-base sm:text-lg font-bold text-white border-b border-gray-700 pb-3 mb-6">How to read this chart</h3>
          <div className="space-y-4 mb-6">
            <div className="flex gap-4">
              <div className="w-3 h-3 rounded-full bg-emerald-500 mt-1 shrink-0 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
              <div>
                <h4 className="text-emerald-400 text-sm font-semibold mb-0.5">Top 10% (Bull Market)</h4>
                <p className="text-xs text-gray-400 leading-relaxed">The optimistic scenario during sustained, profitable economic growth.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-3 h-3 rounded-full bg-indigo-500 mt-1 shrink-0 shadow-[0_0_8px_rgba(99,102,241,0.5)]"></div>
              <div>
                <h4 className="text-indigo-400 text-sm font-semibold mb-0.5">Median (Expected)</h4>
                <p className="text-xs text-gray-400 leading-relaxed">The most likely statistical outcome across 1,000 market simulations.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-3 h-3 rounded-full bg-red-500 mt-1 shrink-0 shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div>
              <div>
                <h4 className="text-red-400 text-sm font-semibold mb-0.5">Bottom 10% (Bear Market)</h4>
                <p className="text-xs text-gray-400 leading-relaxed">The worst-case scenario. Represents a heavy economic recession environment.</p>
              </div>
            </div>
          </div>

          <div className="mt-auto pt-6 border-t border-gray-800">
            <h3 className="text-sm font-bold text-white mb-2">Simulation Assumptions</h3>
            <p className="text-xs text-gray-400 mb-5 leading-relaxed">
              Consistently investing <strong className="text-indigo-400">{savingsRate}%</strong> of leftover income (<strong className="text-white">${activeInvestedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>/mo) into the S&P 500.
            </p>

            <div className="group relative mb-6">
              <div className="flex justify-between text-xs mb-2">
                <span className="text-gray-400 font-medium">Investment Rate</span>
                <span className="text-white font-bold">{savingsRate}%</span>
              </div>
              <input 
                type="range" 
                min="0" 
                max="100" 
                value={savingsRate} 
                onChange={(e) => setSavingsRate(Number(e.target.value))} 
                onMouseUp={(e) => runSimulation(Number((e.target as HTMLInputElement).value), isInflationAdjusted)} 
                onTouchEnd={(e) => runSimulation(Number((e.target as HTMLInputElement).value), isInflationAdjusted)} 
                className="w-full accent-indigo-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer hover:bg-gray-600 transition-colors" 
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <span className="text-gray-200 font-medium text-sm">Adjust for Inflation</span>
                <p className="text-xs text-gray-400 mt-0.5">Show in today's purchasing power (2.5% rate)</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={isInflationAdjusted} 
                  onChange={(e) => { 
                    setIsInflationAdjusted(e.target.checked); 
                    runSimulation(savingsRate, e.target.checked); 
                  }} 
                />
                <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}