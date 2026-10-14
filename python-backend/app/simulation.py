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
    """Simulate many possible futures for one balance over time.

    Returns percentile trajectories year-by-year for charting.
    """
    rng = np.random.default_rng(seed)

    monthly_return = (1 + annual_return) ** (1 / 12) - 1
    monthly_vol = annual_volatility / np.sqrt(12)

    total_months = years * 12
    balances = np.full(iterations, float(start_balance))

    # Track percentiles over time (every year)
    yearly_p10 = [start_balance]
    yearly_p50 = [start_balance]
    yearly_p90 = [start_balance]

    for month in range(1, total_months + 1):
        returns = rng.normal(monthly_return, monthly_vol, size=iterations)
        balances = balances * (1 + returns) + monthly_contribution

        # Record percentiles at the end of every year
        if month % 12 == 0:
            yearly_p10.append(float(np.percentile(balances, 10)))
            yearly_p50.append(float(np.percentile(balances, 50)))
            yearly_p90.append(float(np.percentile(balances, 90)))

    return {
        "years": list(range(years + 1)),
        "p10": yearly_p10,  # Bear Market (Bottom 10%)
        "p50": yearly_p50,  # Median Expected
        "p90": yearly_p90,  # Bull Market (Top 10%)
    }


if __name__ == "__main__":
    print("Simulation test:")
    print(simulate_growth(10000, 300, 0.07, 0.15, years=5, seed=42))