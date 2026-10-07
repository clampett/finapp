from fastapi import FastAPI, HTTPException

from app.market_data import fetch_market_stats

app = FastAPI(title="Finapp Analytics & AI")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/market-data")
def market_data(ticker: str = "VTI", years: int = 10):
    try:
        return fetch_market_stats(ticker, years)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
