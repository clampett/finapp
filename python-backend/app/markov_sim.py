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
        bear_sigma: float = 0.08,
    ):
        # Stored monthly bull/bear transition probabilities by source-state row;
        # state 0 represented bull conditions and state 1 represented bear conditions.
        self.P = np.array(
            [[1.0 - p_bull_to_bear, p_bull_to_bear], [p_bear_to_bull, 1.0 - p_bear_to_bull]]
        )
        self.params = {0: (bull_mu, bull_sigma), 1: (bear_mu, bear_sigma)}

    @classmethod
    def from_assumptions(cls, annual_return, annual_volatility):
        engine = cls()
        sigma = annual_volatility / np.sqrt(12)
        mean = (np.log1p(annual_return) - annual_volatility**2 / 2) / 12
        # Matched stationary monthly log-return mean and variance to Monte Carlo,
        # instead of comparing a 10% model against unrelated low-return regimes.
        engine.log_params = {0: (mean + 0.4 * sigma, 0.6 * sigma), 1: (mean - 1.2 * sigma, sigma)}
        engine.initial_probabilities = np.array([0.75, 0.25])
        engine.return_pools = None
        return engine

    @classmethod
    def from_monthly_returns(cls, returns, trend_returns=None):
        engine = cls()
        returns = np.asarray(returns, dtype=float)
        log_returns = np.log1p(returns if trend_returns is None else trend_returns)
        trend = np.convolve(log_returns, np.ones(12), mode="full")[: len(returns)]
        states = (trend < 0).astype(int)
        counts = np.ones((2, 2), dtype=float)
        np.add.at(counts, (states[:-1], states[1:]), 1)
        engine.P = counts / counts.sum(axis=1, keepdims=True)
        engine.initial_probabilities = np.bincount(states, minlength=2) / len(states)
        # Estimated both regime distributions from the same observed history;
        # monthly samples retained crash observations instead of smoothing tails away.
        engine.return_pools = [returns[states == state] for state in (0, 1)]
        engine.return_pools = [pool if len(pool) else returns for pool in engine.return_pools]
        engine.params = {
            state: (float(pool.mean()), float(pool.std()))
            for state, pool in enumerate(engine.return_pools)
        }
        return engine

    def draw_returns(self, states, rng):
        chance = rng.random(len(states))
        to_bear = (states == 0) & (chance < self.P[0, 1])
        to_bull = (states == 1) & (chance < self.P[1, 0])
        states[to_bear], states[to_bull] = 1, 0
        draws = np.zeros(len(states))
        for state in (0, 1):
            mask = states == state
            if self.return_pools is not None:
                draws[mask] = rng.choice(self.return_pools[state], mask.sum())
            else:
                # Exponentiated log returns so an invested dollar could lose at
                # most its full value, even in an extreme simulated bear month.
                mean, sigma = self.log_params[state]
                draws[mask] = np.expm1(rng.normal(mean, sigma, mask.sum()))
        return draws

    def simulate_trajectory(
        self,
        initial_balance: float,
        monthly_contributions: List[float],
        iterations: int = 1000,
        rng: np.random.Generator = None,
    ) -> List[dict]:
        # Retained the standalone trajectory helper for direct callers. The active
        # household endpoint used this class's parameters through project_household.
        if rng is None:
            rng = np.random.default_rng(42)
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

            # Selected a return distribution per path after its market transition,
            # preserving different market histories across the simulated population.
            mus = np.where(states == 0, self.params[0][0], self.params[1][0])
            sigmas = np.where(states == 0, self.params[0][1], self.params[1][1])
            returns = rng.normal(mus, sigmas)

            # RESTORED REALISM: Applies standard regime volatility to the entire balance
            balances = balances * (1 + returns) + monthly_contributions[m]

            if (m + 1) % 12 == 0:
                yr = (m + 1) // 12
                yearly_results.append(
                    {
                        "year": yr,
                        "p10": float(np.percentile(balances, 10)),
                        "p50": float(np.percentile(balances, 50)),
                        "p90": float(np.percentile(balances, 90)),
                    }
                )

        return yearly_results
