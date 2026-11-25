from fastapi import APIRouter
from app.coach_market import market_context

router = APIRouter()


@router.get("/api/coach/market")
def coach_market():
    # Returned public, cached observations without accepting account data or arbitrary search terms.
    return market_context()


@router.get("/api/coach/chart/{symbol}")
def coach_chart(symbol: str, period: str = "1mo"):
    # Served only validated public benchmark history without exposing account information.
    from app.benchmark_chart import benchmark_chart

    return benchmark_chart(symbol, period)
