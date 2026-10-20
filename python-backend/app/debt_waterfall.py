"""Amortization: monthly_surplus is extra money AFTER minimums."""
from dataclasses import dataclass

@dataclass
class DebtItem:
    id: str
    name: str
    balance: float
    apr: float
    min_payment: float

def simulate_debt_waterfall(debts, monthly_surplus, strategy="avalanche", max_months=360):
    if strategy not in ("avalanche", "snowball"):
        raise ValueError("Unknown repayment strategy")
    active = [dict(id=d.id, balance=float(d.balance), apr=d.apr, minimum=d.min_payment)
              for d in debts if d.balance > 0]
    ids = [d["id"] for d in active]
    budget = max(0.0, sum(d["minimum"] for d in active) + monthly_surplus)
    freed = 0.0
    log = [{"month": 0, "freed_cash_flow": 0.0,
            **{d["id"]: round(d["balance"], 2) for d in active}}]
    for month in range(1, max_months + 1):
        if not active:
            break
        available = budget
        for d in active:
            d["balance"] += d["balance"] * d["apr"] / 12
        required = sum(min(d["balance"], d["minimum"]) for d in active)
        coverage = min(1.0, available / required) if required else 1.0
        for d in active:
            payment = min(d["balance"], d["minimum"]) * coverage
            d["balance"] -= payment
            available -= payment
        active.sort(key=(lambda d: -d["apr"]) if strategy == "avalanche" else (lambda d: d["balance"]))
        for d in active:
            payment = min(d["balance"], max(0.0, available))
            d["balance"] -= payment
            available -= payment
        for d in active:
            if d["balance"] < 0.005:
                d["balance"] = 0.0
                freed += d["minimum"]
        balances = {d["id"]: round(d["balance"], 2) for d in active}
        log.append({"month": month, "freed_cash_flow": round(freed, 2),
                    **{key: balances.get(key, 0.0) for key in ids}})
        active = [d for d in active if d["balance"] > 0]
    return log, freed + monthly_surplus
