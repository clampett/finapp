"""Separate asset growth, cash reserves, contractual debt and cash-flow shortfalls."""

import numpy as np
from app.debt_waterfall import simulate_debt_waterfall
from app.markov_sim import MarkovRegimeSimulator


def project_household(
    nodes,
    debts,
    income,
    expenses,
    investment_rate,
    inflation_rate,
    years=30,
    sim_type="monte_carlo",
    seed=42,
):
    # Reserved the final array slot for a no-growth comparison, with the other
    # 1,000 slots used for market paths under the same household cash-flow rules.
    iterations = 1001  # 1,000 random paths plus one no-asset-growth reference
    # Separated cash, investments, and debt so a negative net worth was never
    # treated as a negative investment balance receiving stock-market returns.
    cash_start = sum(n.balance for n in nodes if n.type in ("CHECKING", "SAVINGS"))
    investment_start = sum(n.balance for n in nodes if n.type == "INVESTMENT")
    cash_yield = (
        (
            sum(n.balance * (n.apr or 0) / 100 for n in nodes if n.type in ("CHECKING", "SAVINGS"))
            / cash_start
        )
        if cash_start
        else 0
    )
    # Projected contractual loans using minimum payments only; extra repayment
    # strategies were compared separately by the debt endpoint branch.
    debt_log, _ = simulate_debt_waterfall(debts, 0, max_months=years * 12)
    debt_path = [sum(row.get(d.id, 0.0) for d in debts) for row in debt_log]
    debt_path.extend([debt_path[-1]] * (years * 12 + 1 - len(debt_path)))
    cash = np.full(iterations, float(cash_start))
    investments = np.full(iterations, float(investment_start))
    borrowing = np.zeros(iterations)
    # Seeded the generator so identical scenarios could be compared without
    # unrelated random draws changing the result on each request.
    rng = np.random.default_rng(seed)
    states = np.zeros(iterations, dtype=int)
    engine = MarkovRegimeSimulator()
    initial = cash_start + investment_start - sum(d.balance for d in debts)
    forecast = [dict(year=0, p10=initial, p50=initial, p90=initial)]
    for month in range(1, years * 12 + 1):
        if sim_type == "markov":
            # Calculated both transitions from the previous state before either
            # was applied, preventing a path from switching twice in one month.
            chance = rng.random(iterations)
            to_bear = (states == 0) & (chance < engine.P[0, 1])
            to_bull = (states == 1) & (chance < engine.P[1, 0])
            states[to_bear], states[to_bull] = 1, 0
            mean = np.where(states == 0, engine.params[0][0], engine.params[1][0])
            vol = np.where(states == 0, engine.params[0][1], engine.params[1][1])
            returns = rng.normal(mean, vol)
        else:
            returns = rng.normal(1.10 ** (1 / 12) - 1, 0.15 / np.sqrt(12), iterations)
        # Excluded market and cash yield from the reference path while retaining
        # its contributions, debt interest, shortfalls, and borrowing costs.
        returns[-1] = 0  # reference assets earn no return
        investments *= np.maximum(0, 1 + returns)
        cash_growth = np.full(iterations, (1 + cash_yield) ** (1 / 12))
        cash_growth[-1] = 1
        cash *= cash_growth
        borrowing *= 1 + 0.12 / 12
        # Recovered this month's actual loan payment from the change in debt
        # plus interest, so paid-off loans released their old payment into surplus.
        previous_row = debt_log[min(month - 1, len(debt_log) - 1)]
        interest = sum(previous_row.get(d.id, 0) * d.apr / 12 for d in debts)
        payment = max(0, debt_path[month - 1] + interest - debt_path[month])
        surplus = income - expenses - payment
        if surplus >= 0:
            # Repaid shortfall borrowing first, then divided the remainder into
            # investments and cash; a 0% allocation still preserved cash savings.
            repay = np.minimum(borrowing, surplus)
            borrowing -= repay
            remaining = surplus - repay
            investments += remaining * investment_rate / 100
            cash += remaining * (1 - investment_rate / 100)
        else:
            # Covered deficits with cash first and investments second. Any
            # uncovered amount was recorded as borrowing rather than negative assets.
            gap = np.full(iterations, -surplus)
            used = np.minimum(cash, gap)
            cash -= used
            gap -= used
            used = np.minimum(investments, gap)
            investments -= used
            borrowing += gap - used
        if month % 12 == 0:
            # Discounted annual net worth into purchasing power before extracting
            # P10/P50/P90; the reference slot was excluded from those percentiles.
            wealth = (cash + investments - borrowing - debt_path[month]) / (1 + inflation_rate) ** (
                month / 12
            )
            p10, p50, p90 = np.percentile(wealth[:-1], [10, 50, 90])
            forecast.append(dict(year=month // 12, p10=float(p10), p50=float(p50), p90=float(p90)))
    return forecast, float(wealth[-1])
