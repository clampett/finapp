import numpy as np
import pandas as pd

from app.asset_classes import DEFAULT_ASSET_CLASS, ticker_for
from app.price_cache import get_prices

# Kept observed historical statistics separate from the illustrative parameters
# currently used by the simulation endpoint; no live calibration was implied.
# Kept this legacy trailing-statistics helper compatible, while the newer active
# calibration in market_model.py reused the full-history cache without a ten-year cut.


def get_ticker_stats(ticker: str, years: int = 10, prices: pd.Series | None = None) -> dict:
    """Trailing return and volatility for one ticker, from cached prices."""
    ticker = ticker.upper()
    # Reused the lookup snapshot when supplied, keeping the price and statistics consistent.
    if prices is None:
        prices = get_prices(ticker)

    cutoff = prices.index[-1] - pd.DateOffset(years=years)
    prices = prices[prices.index >= cutoff]
    if len(prices) < 2:
        raise RuntimeError(f"Not enough price history for {ticker}")

    # Measured compounded growth across elapsed calendar time, while volatility
    # below was annualized from daily returns using the trading-day convention.
    elapsed_years = (prices.index[-1] - prices.index[0]).days / 365.25
    cagr = (prices.iloc[-1] / prices.iloc[0]) ** (1 / elapsed_years) - 1

    daily_returns = prices.pct_change().dropna()
    volatility = daily_returns.std() * np.sqrt(252)  # 252 trading days/year
    # Average yearly return (not compounded). Simulations that add random swings
    # on top of a mean return should use this one; the CAGR runs lower than the
    # average whenever returns are volatile.
    expected_return = daily_returns.mean() * 252

    return {
        "ticker": ticker,
        "start_date": prices.index[0].date().isoformat(),
        "end_date": prices.index[-1].date().isoformat(),
        "cagr": round(float(cagr), 4),
        "expected_annual_return": round(float(expected_return), 4),
        "annual_volatility": round(float(volatility), 4),
    }


def get_market_stats(asset_class: str = DEFAULT_ASSET_CLASS, years: int = 10) -> dict:
    """Trailing return and volatility for an asset class, from cached prices."""
    stats = get_ticker_stats(ticker_for(asset_class), years)
    return {"asset_class": asset_class.upper(), **stats}
