"""Amortization: monthly_surplus is extra money AFTER minimums."""

from dataclasses import dataclass


@dataclass
class DebtItem:
    id: str
    name: str
    balance: float
    apr: float
    min_payment: float


def minimum_payment_schedule(debts, months):
    # Preserved each loan's own contractual payment instead of silently rolling
    # a paid-off loan's minimum into other loans in the household wealth forecast.
    balances = [float(d.balance) for d in debts]
    rows = [dict(balance=sum(balances), payment=0.0, interest=0.0)]
    for _ in range(months):
        payment = interest = 0.0
        for index, debt in enumerate(debts):
            accrued = balances[index] * debt.apr / 12
            due = balances[index] + accrued
            paid = min(due, debt.min_payment) if due > 0 else 0.0
            balances[index] = max(0.0, due - paid)
            interest += accrued
            payment += paid
        rows.append(dict(balance=sum(balances), payment=payment, interest=interest))
    return rows


def simulate_debt_waterfall(
    debts, monthly_surplus, strategy="avalanche", max_months=360, *, detailed=False
):
    # Copied balances into working records so comparing strategies never mutated
    # the caller's original debts or contaminated the next simulation.
    if strategy not in ("avalanche", "snowball"):
        raise ValueError("Unknown repayment strategy")
    active = [
        dict(id=d.id, balance=float(d.balance), apr=d.apr, minimum=d.min_payment)
        for d in debts
        if d.balance > 0
    ]
    ids = [d["id"] for d in active]
    # Included minimums exactly once in a fixed monthly budget. Negative extra
    # surplus reduced affordability instead of inventing money for minimum payments.
    budget = max(0.0, sum(d["minimum"] for d in active) + monthly_surplus)
    freed = 0.0
    total_interest = 0.0
    # Recorded month zero before interest or payments so chart totals and payoff
    # dates were measured from the same starting balance.
    log = [
        {"month": 0, "freed_cash_flow": 0.0, **{d["id"]: round(d["balance"], 2) for d in active}}
    ]
    for month in range(1, max_months + 1):
        if not active:
            break
        available = budget
        for d in active:
            # Accumulated interest before rounding chart balances, preserving an
            # exact amortization total instead of reconstructing it from displayed cents.
            accrued = d["balance"] * d["apr"] / 12
            total_interest += accrued
            d["balance"] += accrued
        # Prorated required payments when the available budget was insufficient;
        # unpaid principal and interest were retained in the following month.
        required = sum(min(d["balance"], d["minimum"]) for d in active)
        coverage = min(1.0, available / required) if required else 1.0
        for d in active:
            payment = min(d["balance"], d["minimum"]) * coverage
            d["balance"] -= payment
            available -= payment
        # Prioritized the highest APR for avalanche or the smallest balance for
        # snowball, then directed the remaining budget through that ordering.
        active.sort(
            key=(lambda d: -d["apr"]) if strategy == "avalanche" else (lambda d: d["balance"])
        )
        for d in active:
            payment = min(d["balance"], max(0.0, available))
            d["balance"] -= payment
            available -= payment
        for d in active:
            if d["balance"] < 0.005:
                d["balance"] = 0.0
                freed += d["minimum"]
        # Kept repaid IDs in later chart rows at zero and retained the original
        # budget, allowing freed minimum payments to roll into remaining loans.
        balances = {d["id"]: round(d["balance"], 2) for d in active}
        log.append(
            {
                "month": month,
                "freed_cash_flow": round(freed, 2),
                **{key: balances.get(key, 0.0) for key in ids},
            }
        )
        active = [d for d in active if d["balance"] > 0]
    if detailed:
        return log, freed + monthly_surplus, dict(interest=total_interest, budget=budget)
    return log, freed + monthly_surplus
