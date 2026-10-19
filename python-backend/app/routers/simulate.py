from fastapi import APIRouter, HTTPException
from app.models import GraphDTO
from app.market_data import get_market_stats
from app.debt_waterfall import DebtItem, simulate_debt_waterfall
from app.markov_sim import MarkovRegimeSimulator

router = APIRouter()

@router.post("/api/simulate")
async def run_simulation(graph: GraphDTO):
    # 1. Fetch real market data for the simulation
    stats = get_market_stats("US_STOCKS", years=10)
    
    # 2. Extract nodes for the new engines
    debt_items = []
    initial_investment_balance = 0.0
    
    for node in graph.nodes:
        if node.type == "debt":
            # Safely grab apr/min_payment if they exist on the model, otherwise use defaults
            apr = getattr(node, 'apr', 0.05) 
            min_payment = getattr(node, 'min_payment', node.balance * 0.02)
            
            debt_items.append(
                DebtItem(id=node.id, balance=node.balance, apr=apr, min_payment=min_payment)
            )
        elif node.type == "investment":
            initial_investment_balance += node.balance
            
    # Use the graph's investment rate as the monthly surplus to throw at debt/investments
    monthly_surplus = getattr(graph, 'investment_rate', 500.0)

    # 3. Run the Debt Waterfall Optimizer
    debt_log, liberated_cash_flow = simulate_debt_waterfall(
        debts=debt_items,
        monthly_surplus=monthly_surplus,
        strategy="avalanche",
        max_months=360
    )
    
    # 4. Configure Markov Simulator using your real market stats
    # Convert annual expected return and volatility to monthly equivalents
    monthly_mu = stats["expected_annual_return"] / 12.0
    monthly_sigma = stats["annual_volatility"] / (12.0 ** 0.5)
    
    markov_engine = MarkovRegimeSimulator(
        bull_mu=monthly_mu,
        bull_sigma=monthly_sigma
        # Bear market params will use the engine's defaults
    )
    
    # 5. Run the Investment Trajectory with the freed cash flow
    contributions = [liberated_cash_flow] * 360
    investment_trajectory = markov_engine.simulate_trajectory(
        initial_balance=initial_investment_balance,
        monthly_contributions=contributions
    )
    
    return {
        "status": "success",
        "market_stats": stats,
        "debt_simulation": debt_log,
        "forecast": investment_trajectory
    }