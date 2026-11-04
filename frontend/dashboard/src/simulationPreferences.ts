export const simulationFields = {
  years: { label: 'Forecast horizon (years)', min: 1, max: 50, step: 1, initial: 30 },
  contribution: { label: 'Surplus invested (%)', min: 0, max: 100, step: 0.1, initial: 100 },
  inflation: { label: 'Annual inflation (%)', min: 0, max: 25, step: 0.1, initial: 2.5 },
  annualReturn: { label: 'Annual return assumption (%)', min: -50, max: 50, step: 0.1, initial: 7 },
  volatility: { label: 'Annual volatility (%)', min: 0, max: 100, step: 0.1, initial: 15 },
  fee: { label: 'Annual investment fee (%)', min: 0, max: 10, step: 0.1, initial: 0 },
  borrowingApr: { label: 'Cash shortfall APR (%)', min: 0, max: 100, step: 0.1, initial: 12 },
  target: { label: 'Net worth target (USD)', min: 0, max: 1e12, step: 0.01, initial: 500000 },
};

type SimulationField = keyof typeof simulationFields;
export type SimulationDefaults = Record<SimulationField, number> & {
  marketSource: 'historical' | 'manual';
  returnMode: 'forward' | 'observed';
  strategy: 'avalanche' | 'snowball';
};

export const simulationFieldNames = Object.keys(simulationFields) as SimulationField[];

export function normalizeSimulationDefaults(raw?: Partial<SimulationDefaults>): SimulationDefaults {
  const fields = Object.fromEntries(
    simulationFieldNames.map((name) => {
      const { min, max, initial } = simulationFields[name];
      const value = raw?.[name];
      const valid =
        typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
      return [name, valid && (name !== 'years' || Number.isInteger(value)) ? value : initial];
    }),
  ) as Record<SimulationField, number>;
  return {
    ...fields,
    marketSource: raw?.marketSource === 'manual' ? 'manual' : 'historical',
    returnMode: raw?.returnMode === 'observed' ? 'observed' : 'forward',
    strategy: raw?.strategy === 'snowball' ? 'snowball' : 'avalanche',
  };
}

export function loadSimulationDefaults(userId: number): SimulationDefaults {
  try {
    return normalizeSimulationDefaults(
      JSON.parse(localStorage.getItem(simulationSettingsKey(userId)) ?? 'null'),
    );
  } catch {
    return normalizeSimulationDefaults();
  }
}

export function simulationSettingsKey(userId: number) {
  return `finapp-simulation-defaults:${userId}`;
}
