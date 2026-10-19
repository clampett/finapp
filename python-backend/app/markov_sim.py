import numpy as np
from typing import List

class MarkovRegimeSimulator:
    def __init__(
        self,
        p_bull_to_bear: float = 0.05,
        p_bear_to_bull: float = 0.15,
        bull_mu: float = 0.008,    # ~9.6% annual return
        bull_sigma: float = 0.035, # Low volatility
        bear_mu: float = -0.005,   # Negative drift
        bear_sigma: float = 0.08   # High volatility / fat tail
    ):
        # 2x2 Transition Matrix P: [[P(0->0), P(0->1)], [P(1->0), P(1->1)]]
        self.P = np.array([
            [1.0 - p_bull_to_bear, p_bull_to_bear],
            [p_bear_to_bull, 1.0 - p_bear_to_bull]
        ])
        self.params = {
            0: (bull_mu, bull_sigma),
            1: (bear_mu, bear_sigma)
        }

    def simulate_trajectory(self, initial_balance: float, monthly_contributions: List[float], rng: np.random.Generator = None) -> List[float]:
        """
        Runs a regime-switching simulation for N months.
        Incorporates sequence-of-returns risk and dynamically varying contribution streams.
        """
        if rng is None:
            rng = np.random.default_rng()

        months = len(monthly_contributions)
        balances = [initial_balance]
        current_state = 0  # Start in Bull / Expansion state

        current_balance = initial_balance
        for m in range(months):
            # 1. State Transition
            current_state = rng.choice([0, 1], p=self.P[current_state])
            
            # 2. Draw return from the active regime's distribution
            mu, sigma = self.params[current_state]
            monthly_return = rng.normal(mu, sigma)

            # 3. Compounding + Cash Flow Injection
            current_balance = (current_balance * (1.0 + monthly_return)) + monthly_contributions[m]
            balances.append(round(float(current_balance), 2))

        return balances