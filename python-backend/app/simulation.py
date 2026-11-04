import numpy as np
from app.cashflow import recurring_to_monthly

# Retained the earlier aggregate-balance simulator for compatibility. The current
# /api/simulate route used projection.py for separate cash, investment, and debt flows.


def process_and_simulate(
    nodes: list,
    investment_rate: float,
    inflation_rate: float = 0.0,
    annual_return: float = 0.10,
    annual_volatility: float = 0.15,
    years: int = 30,
    seed: int | None = None,
    recurring_transactions: list | None = None,
) -> list[dict]:

    total_balance = 0.0
    total_income = 0.0
    total_expense = 0.0

    # Dynamically parse the graph data
    for node in nodes:
        val = float(
            getattr(node, "balance", 0.0)
            if hasattr(node, "balance")
            else node.get("balance", 0.0)
            if isinstance(node, dict)
            else 0.0
        )
        ntype = str(
            getattr(node, "type", "")
            if hasattr(node, "type")
            else node.get("type", "")
            if isinstance(node, dict)
            else ""
        ).upper()
        freq = (
            getattr(node, "frequency", None)
            if hasattr(node, "frequency")
            else (node.get("frequency") if isinstance(node, dict) else None)
        )
        interval = (
            getattr(node, "interval_count", 1)
            if hasattr(node, "interval_count")
            else (node.get("interval_count", 1) if isinstance(node, dict) else 1)
        )
        monthly_val = recurring_to_monthly(val, freq, interval)

        if ntype == "INCOME":
            total_income += monthly_val
        elif ntype == "EXPENSE":
            total_expense += monthly_val
        elif ntype == "DEBT":
            # Debts subtract from net worth; assume 1% minimum payment
            total_balance -= val
            total_expense += val * 0.01
        else:
            # CHECKING, SAVINGS, INVESTMENT
            total_balance += val

    if recurring_transactions:
        node_ids = {
            str(getattr(n, "id", "") if hasattr(n, "id") else n.get("id", ""))
            for n in nodes
        }
        for r in recurring_transactions:
            is_active = (
                getattr(r, "is_active", True)
                if hasattr(r, "is_active")
                else r.get("is_active", True)
            )
            if not is_active:
                continue
            r_notes = (
                getattr(r, "notes", "")
                if hasattr(r, "notes")
                else r.get("notes", "")
            )
            r_id = str(getattr(r, "id", "") if hasattr(r, "id") else r.get("id", ""))
            if r_id in node_ids or (
                r_notes and any(f"[node-id:{nid}]" in r_notes for nid in node_ids)
            ):
                continue
            r_amount = float(
                getattr(r, "amount", 0.0)
                if hasattr(r, "amount")
                else r.get("amount", 0.0)
            )
            r_freq = (
                getattr(r, "frequency", "monthly")
                if hasattr(r, "frequency")
                else r.get("frequency", "monthly")
            )
            r_interval = (
                getattr(r, "interval_count", 1)
                if hasattr(r, "interval_count")
                else r.get("interval_count", 1)
            )
            r_kind = str(
                getattr(r, "kind", "")
                if hasattr(r, "kind")
                else r.get("kind", "")
            ).upper()
            m_val = recurring_to_monthly(r_amount, r_freq, r_interval)
            if r_kind == "INCOME":
                total_income += m_val
            elif r_kind == "EXPENSE":
                total_expense += m_val

    net_cash_flow = total_income - total_expense
    monthly_contribution = net_cash_flow * (investment_rate / 100.0) if net_cash_flow > 0 else 0.0

    return simulate_growth(
        start_balance=total_balance,
        monthly_contribution=monthly_contribution,
        annual_return=annual_return,
        annual_volatility=annual_volatility,
        years=years,
        inflation_rate=inflation_rate,
        seed=seed,
    )


def simulate_growth(
    start_balance: float,
    monthly_contribution: float,
    annual_return: float,
    annual_volatility: float,
    years: int,
    inflation_rate: float,
    seed: int | None,
) -> list[dict]:
    # Converted annual assumptions into monthly inputs before compounding each
    # path; this helper intentionally retained its original aggregate-balance model.
    rng = np.random.default_rng(seed)
    monthly_return = (1 + annual_return) ** (1 / 12) - 1
    monthly_vol = annual_volatility / np.sqrt(12)
    balances = np.full(1000, float(start_balance))

    yearly_results = []

    yearly_results.append(
        {
            "year": "Year 0",
            "p10": float(start_balance),
            "p50": float(start_balance),
            "p90": float(start_balance),
        }
    )

    for year in range(1, years + 1):
        for _ in range(12):
            returns = rng.normal(monthly_return, monthly_vol, size=1000)
            balances = balances * (1 + returns) + monthly_contribution

        # Converted nominal percentile values into the purchasing power selected
        # by the caller, without modifying the underlying simulated balances.
        discount = (1 + inflation_rate) ** year if inflation_rate > 0 else 1.0

        yearly_results.append(
            {
                "year": f"Year {year}",
                "p10": float(np.percentile(balances, 10)) / discount,
                "p50": float(np.percentile(balances, 50)) / discount,
                "p90": float(np.percentile(balances, 90)) / discount,
            }
        )

    return yearly_results
