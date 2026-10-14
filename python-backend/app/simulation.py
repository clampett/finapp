import numpy as np

def process_and_simulate(
    nodes: list,
    investment_rate: float,
    inflation_rate: float = 0.0,
    annual_return: float = 0.10,
    annual_volatility: float = 0.15,
    years: int = 30,
    seed: int | None = None
) -> list[dict]:
    
    total_balance = 0.0
    total_income = 0.0
    total_expense = 0.0

    # Dynamically parse the graph data
    for node in nodes:
        val = float(node.balance)
        ntype = str(node.type).upper()
        
        if ntype == 'INCOME':
            total_income += val
        elif ntype == 'EXPENSE':
            total_expense += val
        elif ntype == 'DEBT':
            # Debts subtract from net worth; assume 1% minimum payment
            total_balance -= val
            total_expense += (val * 0.01)
        else:
            # CHECKING, SAVINGS, INVESTMENT
            total_balance += val

    net_cash_flow = total_income - total_expense
    monthly_contribution = net_cash_flow * (investment_rate / 100.0) if net_cash_flow > 0 else 0.0

    return simulate_growth(
        start_balance=total_balance,
        monthly_contribution=monthly_contribution,
        annual_return=annual_return,
        annual_volatility=annual_volatility,
        years=years,
        inflation_rate=inflation_rate,
        seed=seed
    )

def simulate_growth(
    start_balance: float,
    monthly_contribution: float,
    annual_return: float,
    annual_volatility: float,
    years: int,
    inflation_rate: float,
    seed: int | None
) -> list[dict]:
    rng = np.random.default_rng(seed)
    monthly_return = (1 + annual_return) ** (1 / 12) - 1
    monthly_vol = annual_volatility / np.sqrt(12)
    balances = np.full(1000, float(start_balance))
    
    yearly_results = []
    
    yearly_results.append({
        "year": "Year 0",
        "p10": float(start_balance),
        "p50": float(start_balance),
        "p90": float(start_balance)
    })

    for year in range(1, years + 1):
        for _ in range(12):
            returns = rng.normal(monthly_return, monthly_vol, size=1000)
            balances = balances * (1 + returns) + monthly_contribution
            
        discount = (1 + inflation_rate) ** year if inflation_rate > 0 else 1.0

        yearly_results.append({
            "year": f"Year {year}",
            "p10": float(np.percentile(balances, 10)) / discount,
            "p50": float(np.percentile(balances, 50)) / discount,
            "p90": float(np.percentile(balances, 90)) / discount,
        })

    return yearly_results