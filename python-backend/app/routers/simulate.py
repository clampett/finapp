from fastapi import APIRouter, HTTPException
from app.models import GraphDTO
from app.simulation import process_and_simulate
from app.market_data import get_market_stats

router = APIRouter()

@router.post("/api/simulate")
async def run_simulation(graph: GraphDTO):
    # Fetch real market data for the simulation (using US_STOCKS as the default)
    stats = get_market_stats("US_STOCKS", years=10)
    
    # Run the updated Monte Carlo simulation engine
    # process_and_simulate now handles sorting nodes, debts, inflation, and investment rates
    projection = process_and_simulate(
        nodes=graph.nodes,
        investment_rate=graph.investment_rate,
        inflation_rate=graph.inflation_rate,
        annual_return=stats["expected_annual_return"],
        annual_volatility=stats["annual_volatility"],
        years=30
    )
    
    return {
        "status": "success",
        "market_stats": stats,
        "forecast": projection
    }