"""Separate asset growth, cash reserves, contractual debt and cash-flow shortfalls."""

import numpy as np
from app.debt_waterfall import minimum_payment_schedule
from app.markov_sim import MarkovRegimeSimulator
from app.cashflow import SavingPlan
from app.market_model import assumed_model


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
    *,
    plan=None,
    market=None,
    income_basis="net",
    tax_rate=0.0,
    income_growth=0.0,
    expense_growth=0.0,
    annual_fee=0.0,
    borrowing_apr=0.12,
    target=500000.0,
    detailed=False,
):
    # Reserved the final array slot for a no-growth comparison, with the other
    # 1,000 slots used for market paths under the same household cash-flow rules.
    iterations = 1001  # 1,000 random paths plus one no-asset-growth reference
    # Separated cash, investments, and debt so a negative net worth was never
    # treated as a negative investment balance receiving stock-market returns.
    cash_start = sum(n.balance for n in nodes if n.type in ("CHECKING", "SAVINGS"))
    investment_start = sum(n.balance for n in nodes if n.type == "INVESTMENT")

    def account_yield(kind):
        accounts = [n for n in nodes if n.type == kind]
        balance = sum(n.balance for n in accounts)
        return (
            sum(n.balance * n.apr / 100 for n in accounts) / balance
            if balance
            else sum(n.apr / 100 for n in accounts) / len(accounts) if accounts else 0
        )

    cash_yield = account_yield("CHECKING")
    savings_yield = account_yield("SAVINGS")
    savings_start = sum(n.balance for n in nodes if n.type == "SAVINGS")
    # Projected contractual loans using minimum payments only; extra repayment
    # strategies were compared separately by the debt endpoint branch.
    debt_log = minimum_payment_schedule(debts, years * 12)
    debt_path = [row["balance"] for row in debt_log]
    cash = np.full(iterations, float(cash_start - savings_start))
    savings = np.full(iterations, float(savings_start))
    investments = np.full(iterations, float(investment_start))
    borrowing = np.zeros(iterations)
    contributions = np.zeros(iterations)
    plan = plan or SavingPlan()
    market = market or assumed_model()
    # Seeded the generator so identical scenarios could be compared without
    # unrelated random draws changing the result on each request.
    rng = np.random.default_rng(seed)
    engine = (
        MarkovRegimeSimulator.from_monthly_returns(market.returns, market.regime_returns)
        if market.returns is not None
        else MarkovRegimeSimulator.from_assumptions(
            market.metadata["annual_return"], market.metadata["annual_volatility"]
        )
    )
    states = rng.choice([0, 1], size=iterations, p=engine.initial_probabilities)
    offsets = (
        rng.integers(0, len(market.returns), iterations) if market.returns is not None else None
    )
    initial = cash_start + investment_start - sum(d.balance for d in debts)
    forecast = [
        dict(
            year=0,
            p10=initial,
            p50=initial,
            p90=initial,
            reference=initial,
            **{f"path_{i}": initial for i in range(8)},
        )
    ]
    ledger = []
    annual = dict(income=0.0, taxes=0.0, expenses=0.0, debt_payments=0.0, debt_interest=0.0)
    for month in range(1, years * 12 + 1):
        if sim_type == "markov":
            # Calculated both transitions from the previous state before either
            # was applied, preventing a path from switching twice in one month.
            returns = engine.draw_returns(states, rng)
        elif market.returns is not None:
            # Resampled consecutive twelve-month blocks so historical crashes
            # and recovery sequences were retained within each sampled year.
            if (month - 1) % 12 == 0:
                offsets = rng.integers(0, len(market.returns), iterations)
            returns = market.returns[(offsets + (month - 1) % 12) % len(market.returns)]
        else:
            # Converted an expected annual arithmetic return into monthly log
            # drift, accounting for volatility drag without allowing returns below -100%.
            returns = np.expm1(rng.normal(market.log_mean, market.log_volatility, iterations))
        # Excluded market and cash yield from the reference path while retaining
        # its contributions, debt interest, shortfalls, and borrowing costs.
        returns[-1] = 0  # reference assets earn no return
        investments *= 1 + returns
        fee_factor = np.full(iterations, (1 - annual_fee) ** (1 / 12))
        fee_factor[-1] = 1
        investments *= fee_factor
        cash_growth = np.full(iterations, (1 + cash_yield) ** (1 / 12))
        cash_growth[-1] = 1
        cash *= cash_growth
        # Separated checking and savings yields so a zero-interest checking
        # deposit did not accidentally receive the emergency fund's APY.
        savings_growth = np.full(iterations, (1 + savings_yield) ** (1 / 12))
        savings_growth[-1] = 1
        savings *= savings_growth
        borrowing *= 1 + borrowing_apr / 12
        # Recovered this month's actual loan payment from the change in debt
        # plus interest, so paid-off loans released their old payment into surplus.
        # Replaced the earlier rounded-balance reconstruction with exact payment
        # fields, preserving principal conservation and each loan's own payoff date.
        interest = debt_log[month]["interest"]
        payment = debt_log[month]["payment"]
        elapsed_years = (month - 1) // 12
        gross = income * (1 + income_growth) ** elapsed_years
        living = expenses * (1 + expense_growth) ** elapsed_years
        taxes = gross * tax_rate if income_basis == "gross" else 0.0
        surplus = gross - taxes - living - payment
        for key, value in dict(
            income=gross,
            taxes=taxes,
            expenses=living,
            debt_payments=payment,
            debt_interest=interest,
        ).items():
            annual[key] += value
        if surplus >= 0:
            # Repaid shortfall borrowing first, then divided the remainder into
            # investments and cash; a 0% allocation still preserved cash savings.
            # Applied scheduled investment/saving routes before the discretionary
            # slider; zero extra investing did not cancel an existing planned transfer.
            repay = np.minimum(borrowing, surplus)
            borrowing -= repay
            allocated = plan.allocate(surplus - repay, investment_rate)
            investments += allocated["investment"]
            contributions += allocated["investment"]
            savings += allocated["planned_savings"]
            cash += allocated["cash"] - allocated["planned_savings"]
        else:
            # Covered deficits with cash first and investments second. Any
            # uncovered amount was recorded as borrowing rather than negative assets.
            gap = np.full(iterations, -surplus)
            used = np.minimum(cash, gap)
            cash -= used
            gap -= used
            used = np.minimum(savings, gap)
            savings -= used
            gap -= used
            used = np.minimum(investments, gap)
            investments -= used
            borrowing += gap - used
        if month % 12 == 0:
            # Discounted annual net worth into purchasing power before extracting
            # P10/P50/P90; the reference slot was excluded from those percentiles.
            wealth = (cash + savings + investments - borrowing - debt_path[month]) / (
                1 + inflation_rate
            ) ** (month / 12)
            p10, p50, p90 = np.percentile(wealth[:-1], [10, 50, 90])
            forecast.append(
                dict(
                    year=month // 12,
                    p10=float(p10),
                    p50=float(p50),
                    p90=float(p90),
                    reference=float(wealth[-1]),
                    **{f"path_{i}": float(wealth[i]) for i in range(8)},
                )
            )
            ledger.append(
                dict(
                    year=month // 12,
                    **{k: round(v, 2) for k, v in annual.items()},
                    debt_remaining=round(debt_path[month], 2),
                    invested_contributions=float(np.median(contributions[:-1])),
                )
            )
            annual = dict.fromkeys(annual, 0.0)
    if not detailed:
        return forecast, float(wealth[-1])
    counts, boundaries = np.histogram(wealth[:-1], bins=20)
    details = dict(
        yearly_cashflow=ledger,
        ending_distribution=[
            dict(
                lower=float(boundaries[i]),
                upper=float(boundaries[i + 1]),
                count=int(count),
                share=float(count / 1000),
            )
            for i, count in enumerate(counts)
        ],
        summary=dict(
            probability_positive=float(np.mean(wealth[:-1] > 0)),
            probability_target=float(np.mean(wealth[:-1] >= target)),
            target=target,
            median_contributions=float(np.median(contributions[:-1])),
            median_borrowing=float(np.median(borrowing[:-1])),
            first_positive_median_year=next((p["year"] for p in forecast if p["p50"] > 0), None),
        ),
        market_data={
            **market.metadata,
            "method": (
                "History-calibrated bull/bear regimes"
                if sim_type == "markov" and market.returns is not None
                else (
                    "Assumption-matched bull/bear regimes"
                    if sim_type == "markov"
                    else market.metadata["method"]
                )
            ),
            "regime_transitions": engine.P.tolist() if sim_type == "markov" else None,
        },
    )
    return forecast, float(wealth[-1]), details
