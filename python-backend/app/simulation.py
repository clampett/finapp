"""Monte Carlo simulation for Finapp.

Step 1: a simple growth simulation that works on plain numbers.
Later steps will read the node/edge graph from schemas.py and feed
this function the right inputs.
"""

import numpy as np


def simulate_growth(
    start_balance: float,
    monthly_contribution: float,
    annual_return: float,
    annual_volatility: float,
    years: int = 30,
    iterations: int = 1000,
    seed: int | None = None,
) -> dict:
    """Simulate many possible futures for one balance.

    annual_return and annual_volatility are decimals (0.07 means 7%).
    Pass a seed to get repeatable results (useful for tests).
    Returns the 10th, 50th and 90th percentile of the final balance.
    """
    rng = np.random.default_rng(seed)

    # Convert yearly numbers into monthly ones.
    # Return compounds (12th root); volatility scales with the square root of time.
    monthly_return = (1 + annual_return) ** (1 / 12) - 1
    monthly_vol = annual_volatility / np.sqrt(12)

    # One slot per simulated future, all starting at the same balance.
    balances = np.full(iterations, float(start_balance))

    # Loop over months. Each pass updates every simulated future at once,
    # which keeps this fast even with thousands of iterations.
    for _ in range(years * 12):
        returns = rng.normal(monthly_return, monthly_vol, size=iterations)
        balances = balances * (1 + returns) + monthly_contribution

    return {
        "p10": float(np.percentile(balances, 10)),
        "p50": float(np.percentile(balances, 50)),
        "p90": float(np.percentile(balances, 90)),
    }


if __name__ == "__main__":
    # Quick manual test. Run from the python-backend folder with:
    #   python -m app.simulation
    print("With randomness:")
    print(simulate_growth(10000, 300, 0.07, 0.15, years=20, seed=42))

    # Sanity check: with zero volatility all three percentiles should match,
    # and equal the plain compound-growth formula when contributions are 0.
    print("No volatility, no contributions (should all be equal):")
    print(simulate_growth(10000, 0, 0.07, 0.0, years=20, iterations=10, seed=1))
    print("Formula check:", round(10000 * (1.07**20), 2))