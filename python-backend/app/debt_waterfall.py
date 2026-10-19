from dataclasses import dataclass
from typing import List, Literal, Tuple

@dataclass
class DebtItem:
    id: str
    balance: float
    apr: float
    min_payment: float

def simulate_debt_waterfall(
    debts: List[DebtItem],
    monthly_surplus: float,
    strategy: Literal["avalanche", "snowball"] = "avalanche",
    max_months: int = 360
) -> Tuple[List[dict], float]:
    """
    Simulates monthly dynamic multi-debt amortization with payment waterfall.
    Returns:
      - monthly_log: Trajectory of balances and interest paid per month.
      - freed_cash_flow: Total monthly cash flow liberated to roll into investments.
    """
    active_debts = [
        {"id": d.id, "balance": float(d.balance), "apr": float(d.apr), "min_payment": float(d.min_payment)}
        for d in debts if d.balance > 0
    ]
    
    monthly_log = []
    freed_cash_flow = 0.0

    for month in range(1, max_months + 1):
        if not active_debts:
            break

        # 1. Apply monthly compounding interest
        for d in active_debts:
            monthly_interest = d["balance"] * (d["apr"] / 12.0)
            d["balance"] += monthly_interest

        # 2. Pay minimum payments across active debts
        available_surplus = monthly_surplus
        for d in active_debts:
            payment = min(d["balance"], d["min_payment"])
            d["balance"] -= payment

        # 3. Sort debts dynamically according to the chosen strategy
        if strategy == "avalanche":
            active_debts.sort(key=lambda x: x["apr"], reverse=True)
        elif strategy == "snowball":
            active_debts.sort(key=lambda x: x["balance"], reverse=False)

        # 4. Funnel surplus capital into the priority target
        for d in active_debts:
            if available_surplus <= 0:
                break
            if d["balance"] > 0:
                extra = min(d["balance"], available_surplus)
                d["balance"] -= extra
                available_surplus -= extra

        # 5. Waterfall rollover: retire debts and accumulate liberated minimum payments
        surviving = []
        for d in active_debts:
            if d["balance"] <= 0.01:
                freed_cash_flow += d["min_payment"]
            else:
                surviving.append(d)
        active_debts = surviving

        monthly_log.append({
            "month": month,
            "remaining_debts": {d["id"]: round(d["balance"], 2) for d in active_debts},
            "freed_cash_flow": round(freed_cash_flow, 2)
        })

    total_liberated_flow = freed_cash_flow + monthly_surplus
    return monthly_log, total_liberated_flow