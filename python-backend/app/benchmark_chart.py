"""Bounded chart history, shared by coach benchmarks and validated stock holdings."""

from datetime import datetime, timedelta, timezone
import threading
import math
import pandas as pd
from fastapi import HTTPException
from app.price_cache import get_prices
from app.coach_market import BENCHMARKS

_lock = threading.Lock()
_cache = {}
_attempts = {}


def _now():
    return datetime.now(timezone.utc)


def _intraday(symbol):
    import yfinance as yf

    # Requested five-minute regular-session bars and retained the latest available trading day.
    frame = yf.Ticker(symbol).history(
        period="5d", interval="5m", auto_adjust=True, prepost=False, timeout=8
    )
    if frame.empty or "Close" not in frame:
        raise ValueError("Intraday prices are unavailable.")
    prices = frame["Close"].dropna()
    if prices.index.tz is None:
        raise ValueError("The exchange timezone could not be verified.")
    local = prices.index.tz_convert("America/New_York")
    return prices[local.date == local[-1].date()]


def benchmark_chart(symbol, period):
    # Restricted provider requests to four known benchmarks and four supported chart periods.
    if symbol not in BENCHMARKS or period not in {"1d", "1mo", "1y", "5y"}:
        raise HTTPException(status_code=400, detail="Choose a supported benchmark and timeframe.")
    return _chart_history(symbol, period)


def stock_chart(raw_symbol, period):
    from app.stocks import normalize_symbol, lookup_stock

    # Reused the stock lookup's USD verification, unknown-symbol backoff and cache-cap protection.
    symbol = normalize_symbol(raw_symbol)
    if period not in {"1d", "1mo", "1y", "5y"}:
        raise HTTPException(status_code=400, detail="Choose a supported chart timeframe.")
    lookup_stock(symbol)
    return _chart_history(symbol, period)


def _chart_history(symbol, period):
    now = _now()
    key = (symbol, period)
    ttl = timedelta(minutes=5) if period == "1d" else timedelta(hours=24)
    with _lock:
        cached = _cache.get(key)
        if cached and now - cached[0] < ttl:
            return dict(cached[1], stale=False)
        # Coalesced concurrent requests and backed off failures without requerying Yahoo on every click.
        if key in _attempts and now - _attempts[key] < timedelta(minutes=5):
            if cached and now - cached[0] < timedelta(hours=24):
                return dict(cached[1], stale=True)
            raise HTTPException(
                status_code=503,
                detail="This timeframe is temporarily unavailable. Please try again later.",
            )
        # Bounded retained chart snapshots and retry entries even as holdings changed across users.
        if key not in _attempts and len(_attempts) >= 256:
            _attempts.pop(next(iter(_attempts)))
        _attempts[key] = now
        try:
            prices = (
                _intraday(symbol) if period == "1d" else get_prices(symbol, require_currency=True)
            )
            prices = prices.sort_index()
            prices = prices[~prices.index.duplicated(keep="last")]
            if period != "1d" and not prices.empty:
                # Anchored calendar windows to the latest available close rather than pretending cached prices were live.
                offset = (
                    pd.DateOffset(months=1)
                    if period == "1mo"
                    else pd.DateOffset(years=int(period[0]))
                )
                prices = prices.loc[prices.index >= prices.index[-1] - offset]
            points = []
            for date, price in prices.items():
                if not math.isfinite(float(price)) or price <= 0:
                    continue
                stamp = (
                    date.tz_convert("UTC").isoformat()
                    if period == "1d"
                    else date.date().isoformat()
                )
                points.append({"date": stamp, "close": round(float(price), 4)})
            if not points:
                raise ValueError("No usable prices.")
            result = dict(
                symbol=symbol,
                period=period,
                interval="5m" if period == "1d" else "1d",
                timezone="America/New_York",
                adjusted=True,
                points=points[-1500:],
                fetched_at=now.isoformat(),
            )
            if key not in _cache and len(_cache) >= 256:
                _cache.pop(next(iter(_cache)))
            _cache[key] = (now, result)
            return dict(result, stale=False)
        except Exception as error:
            # Retained a dated stale chart briefly when the provider failed instead of inventing replacement points.
            if cached and now - cached[0] < timedelta(hours=24):
                return dict(cached[1], stale=True)
            raise HTTPException(
                status_code=503,
                detail="This timeframe is temporarily unavailable. Please try again later.",
            ) from error
