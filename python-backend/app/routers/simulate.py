from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import numpy as np

router = APIRouter()

class NodeInput(BaseModel):
    id: str
    type: str
    balance: float

class SimulationRequest(BaseModel):
    investment_rate: float
    inflation_rate: float
    nodes: List[NodeInput]
    edges: Optional[List[dict]] = []

def simulate_growth(start_balance: float, monthly_contribution: float, annual_return: float, annual_volatility: float, years: int = 30, iterations: int = 1000, seed: int = 42):
    rng = np.random.default_rng(seed)
    monthly_return = (1 + annual_return) ** (1 / 12) - 1
    monthly_vol = annual_volatility / np.sqrt(12)
    
    total_months = years * 12
    balances = np.full(iterations, float(start_balance))
    
    forecast = []
    # Year 0 initial point
    forecast.append({
        "year": 0,
        "p10": float(start_balance),
        "p50": float(start_balance),
        "p90": float(start_balance)
    })
    
    for month in range(1, total_months + 1):
        returns = rng.normal(monthly_return, monthly_vol, size=iterations)
        balances = balances * (1 + returns) + monthly_contribution
        
        if month % 12 == 0:
            yr = month // 12
            forecast.append({
                "year": yr,
                "p10": float(np.percentile(balances, 10)),
                "p50": float(np.percentile(balances, 50)),
                "p90": float(np.percentile(balances, 90))
            })
            
    return forecast

@router.post("/api/simulate")
async def run_simulation(payload: SimulationRequest):
    try:
        # Calculate starting balance and monthly contribution from node balances
        start_balance = sum(n.balance for n in payload.nodes if n.type in ['CHECKING', 'SAVINGS', 'INVESTMENT', 'ROTH IRA'])
        if start_balance == 0:
            start_balance = 1800.0  # Fallback to default checking balance
            
        income = sum(n.balance for n in payload.nodes if n.type == 'INCOME')
        expense = sum(n.balance for n in payload.nodes if n.type in ['EXPENSE', 'DEBT'])
        net_cash_flow = max(0.0, income - expense)
        monthly_contribution = net_cash_flow * (payload.investment_rate / 100.0)
        
        forecast_data = simulate_growth(
            start_balance=start_balance,
            monthly_contribution=monthly_contribution,
            annual_return=0.07,
            annual_volatility=0.15,
            years=30
        )
        
        return {
            "status": "success",
            "forecast": forecast_data
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))