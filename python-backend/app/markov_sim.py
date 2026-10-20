import numpy as np
from typing import List

class MarkovRegimeSimulator:
    def __init__(
        self,
        p_bull_to_bear: float = 0.05,
        p_bear_to_bull: float = 0.15,
        bull_mu: float = 0.008,
        bull_sigma: float = 0.035,
        bear_mu: float = -0.020,
        bear_sigma: float = 0.08
    ):
        self.P = np.array([
            [1.0 - p_bull_to_bear, p_bull_to_bear],
            [p_bear_to_bull, 1.0 - p_bear_to_bull]
        ])
        self.params = {
            0: (bull_mu, bull_sigma),
            1: (bear_mu, bear_sigma)
        }

    def simulate_trajectory(self, initial_balance: float, monthly_contributions: List[float], iterations: int = 1000, rng: np.random.Generator = None) -> List[dict]:
        if rng is None: rng = np.random.default_rng(42)
        months = len(monthly_contributions)

        states = np.zeros(iterations, dtype=int)
        balances = np.full(iterations, float(initial_balance))

        yearly_results = []

        for m in range(months):
            rands = rng.random(iterations)
            switch_to_bear = (states == 0) & (rands < self.P[0, 1])
            switch_to_bull = (states == 1) & (rands < self.P[1, 0])
            states[switch_to_bear] = 1
            states[switch_to_bull] = 0

            mus = np.where(states == 0, self.params[0][0], self.params[1][0])
            sigmas = np.where(states == 0, self.params[0][1], self.params[1][1])
            returns = rng.normal(mus, sigmas)

            # RESTORED REALISM: Applies standard regime volatility to the entire balance
            balances = balances * (1 + returns) + monthly_contributions[m]

            if (m + 1) % 12 == 0:
                yr = (m + 1) // 12
                yearly_results.append({
                    "year": yr,
                    "p10": float(np.percentile(balances, 10)),
                    "p50": float(np.percentile(balances, 50)),
                    "p90": float(np.percentile(balances, 90))
                })

        return yearly_results
