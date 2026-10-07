import numpy as np
import yfinance as yf


def fetch_market_stats(ticker: str = "VTI", years: int = 10) -> dict:
    # auto_adjust=True folds dividends and splits into the price,
    # so the return reflects total return
    prices = yf.Ticker(ticker).history(period=f"{years}y", auto_adjust=True)["Close"]
    if prices.empty:
        raise ValueError(f"No data found for ticker '{ticker}'")

    elapsed_years = (prices.index[-1] - prices.index[0]).days / 365.25
    cagr = (prices.iloc[-1] / prices.iloc[0]) ** (1 / elapsed_years) - 1

    daily_returns = prices.pct_change().dropna()
    volatility = daily_returns.std() * np.sqrt(252)  # 252 trading days/year

    return {
        "ticker": ticker.upper(),
        "start_date": prices.index[0].date().isoformat(),
        "end_date": prices.index[-1].date().isoformat(),
        "cagr": round(float(cagr), 4),
        "annual_volatility": round(float(volatility), 4),
    }
