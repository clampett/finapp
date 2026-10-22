"""SQLite cache for Yahoo Finance price history.

Every simulation needs 10 years of daily prices per ticker. Fetching them from
Yahoo on every click would get us rate limited, so each ticker is fetched at
most once per CACHE_TTL and everything else is served from SQLite.
"""

import os
import sqlite3
import threading
from contextlib import closing
from datetime import datetime, timedelta, timezone

import pandas as pd

# Retained market-history caching as a separate utility; the current simulation
# endpoint used fixed illustrative assumptions rather than calling this cache.

HISTORY_PERIOD = "10y"
CACHE_TTL = timedelta(hours=24)  # daily prices: refreshing more often gains nothing
RETRY_AFTER = timedelta(minutes=15)  # after a failed fetch, leave Yahoo alone for a while

_refresh_lock = threading.Lock()


def _db_path() -> str:
    return os.environ.get("PRICE_CACHE_DB", "price_cache.db")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _connect() -> sqlite3.Connection:
    path = os.path.abspath(_db_path())
    os.makedirs(os.path.dirname(path), exist_ok=True)
    conn = sqlite3.connect(path)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS prices ("
        "ticker TEXT NOT NULL, date TEXT NOT NULL, close REAL NOT NULL, "
        "PRIMARY KEY (ticker, date))"
    )
    conn.execute(
        "CREATE TABLE IF NOT EXISTS fetch_log ("
        "ticker TEXT PRIMARY KEY, fetched_at TEXT, attempted_at TEXT NOT NULL)"
    )
    return conn


def _download(ticker: str) -> pd.Series:
    import yfinance as yf  # imported here so the cache can be tested without it

    prices = yf.Ticker(ticker).history(period=HISTORY_PERIOD, auto_adjust=True)["Close"]
    return prices.dropna()


def _needs_refresh(ticker: str) -> bool:
    # Distinguished a successful cache lifetime from a failed-request retry delay,
    # preventing a provider outage from triggering a download on every page action.
    with closing(_connect()) as conn:
        row = conn.execute(
            "SELECT fetched_at, attempted_at FROM fetch_log WHERE ticker = ?", (ticker,)
        ).fetchone()
    if row is None:
        return True
    fetched_at, attempted_at = row
    now = _now()
    if fetched_at and now - datetime.fromisoformat(fetched_at) < CACHE_TTL:
        return False
    if attempted_at and now - datetime.fromisoformat(attempted_at) < RETRY_AFTER:
        return False  # a recent attempt failed; don't hammer Yahoo
    return True


def _record_failure(ticker: str) -> None:
    # Updated only the attempt timestamp after failure, preserving the last known
    # successful fetch time and any stale prices available for fallback.
    with closing(_connect()) as conn:
        with conn:
            conn.execute(
                "INSERT INTO fetch_log (ticker, fetched_at, attempted_at) VALUES (?, NULL, ?) "
                "ON CONFLICT(ticker) DO UPDATE SET attempted_at = excluded.attempted_at",
                (ticker, _now().isoformat()),
            )


def _refresh(ticker: str) -> None:
    try:
        prices = _download(ticker)
        if prices.empty:
            raise RuntimeError(f"Yahoo returned no data for {ticker}")
    except Exception:
        _record_failure(ticker)
        raise

    rows = [(ticker, d.date().isoformat(), float(p)) for d, p in prices.items()]
    stamp = _now().isoformat()
    with closing(_connect()) as conn:
        with conn:  # one transaction: readers never see a half-replaced series
            # Adjusted prices change retroactively (dividends, splits), so
            # replace the whole series instead of appending new days.
            conn.execute("DELETE FROM prices WHERE ticker = ?", (ticker,))
            conn.executemany("INSERT INTO prices (ticker, date, close) VALUES (?, ?, ?)", rows)
            conn.execute(
                "INSERT INTO fetch_log (ticker, fetched_at, attempted_at) VALUES (?, ?, ?) "
                "ON CONFLICT(ticker) DO UPDATE SET "
                "fetched_at = excluded.fetched_at, attempted_at = excluded.attempted_at",
                (ticker, stamp, stamp),
            )


def _has_data(ticker: str) -> bool:
    with closing(_connect()) as conn:
        return (
            conn.execute("SELECT 1 FROM prices WHERE ticker = ? LIMIT 1", (ticker,)).fetchone()
            is not None
        )


def _load(ticker: str) -> pd.Series:
    with closing(_connect()) as conn:
        rows = conn.execute(
            "SELECT date, close FROM prices WHERE ticker = ? ORDER BY date", (ticker,)
        ).fetchall()
    if not rows:
        raise RuntimeError(f"No cached prices for {ticker} and Yahoo is unavailable right now")
    return pd.Series(
        [close for _, close in rows],
        index=pd.to_datetime([date for date, _ in rows]),
        name=ticker,
    )


def get_prices(ticker: str) -> pd.Series:
    """Daily adjusted closing prices, served from SQLite when fresh enough."""
    ticker = ticker.upper()
    # Rechecked freshness while holding the process lock so concurrent requests
    # for the same stale ticker did not all repeat the same provider download.
    if _needs_refresh(ticker):
        with _refresh_lock:
            if _needs_refresh(ticker):  # another request may have refreshed while we waited
                try:
                    _refresh(ticker)
                except Exception:
                    if not _has_data(ticker):
                        raise  # nothing cached to fall back on
                    # otherwise keep serving the stale data
    return _load(ticker)
