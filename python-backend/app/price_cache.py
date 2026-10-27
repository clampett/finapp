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

from app.asset_classes import ASSET_CLASS_TICKERS

# Retained market-history caching as a separate utility; the current simulation
# endpoint used fixed illustrative assumptions rather than calling this cache.
# Connected this previously separate cache to active calibration in market_model.py;
# the earlier integration notes above were retained as implementation history.

# Extended the earlier ten-year implementation to the provider's full available
# adjusted history; the original module notes were retained above for context.
HISTORY_PERIOD = "max"
CACHE_TTL = timedelta(hours=24)  # daily prices: refreshing more often gains nothing
RETRY_AFTER = timedelta(minutes=15)  # after a failed fetch, leave Yahoo alone for a while

_refresh_lock = threading.Lock()
MAX_CACHED_TICKERS = 200  # distinct symbols kept in the cache
# Preserved both the legacy asset proxies and the longer-history simulation proxies.
PROTECTED_TICKERS = frozenset(ASSET_CLASS_TICKERS.values()) | {"SPY", "EFA"}


class NoPriceData(RuntimeError):
    """Yahoo has no price history for this ticker (an unknown or delisted symbol)."""


class UnsupportedCurrency(ValueError):
    """The holding cannot be valued in USD without currency conversion."""


def _check_usd(currency):
    # Required provider-confirmed USD instead of guessing currency from the symbol.
    if not currency:
        raise RuntimeError("The quote currency could not be verified. Try again later.")
    if currency != "USD":
        raise UnsupportedCurrency(
            f"Only USD-priced securities are supported; this symbol is quoted in {currency}."
        )


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
    conn.execute(
        "CREATE TABLE IF NOT EXISTS cache_metadata ("
        "ticker TEXT PRIMARY KEY, history_period TEXT NOT NULL)"
    )
    # Added metadata separately so existing price caches remained readable without migration.
    conn.execute(
        "CREATE TABLE IF NOT EXISTS quote_metadata ("
        "ticker TEXT PRIMARY KEY, currency TEXT, last_accessed TEXT NOT NULL)"
    )
    return conn


def _download(ticker: str) -> pd.Series:
    import yfinance as yf  # imported here so the cache can be tested without it

    instrument = yf.Ticker(ticker)
    history = instrument.history(period=HISTORY_PERIOD, auto_adjust=True, timeout=8)
    if history.empty or "Close" not in history:
        return pd.Series(dtype=float)  # unknown or delisted symbol
    prices = history["Close"].dropna()
    # Reused the currency metadata returned by the same history request.
    prices.attrs["currency"] = instrument.get_history_metadata().get("currency")
    return prices


def _needs_refresh(ticker: str, require_currency: bool = False) -> bool:
    # Distinguished a successful cache lifetime from a failed-request retry delay,
    # preventing a provider outage from triggering a download on every page action.
    with closing(_connect()) as conn:
        row = conn.execute(
            "SELECT fetched_at, attempted_at FROM fetch_log WHERE ticker = ?", (ticker,)
        ).fetchone()
        coverage = conn.execute(
            "SELECT history_period FROM cache_metadata WHERE ticker = ?", (ticker,)
        ).fetchone()
        quote = conn.execute(
            "SELECT currency FROM quote_metadata WHERE ticker = ?", (ticker,)
        ).fetchone()
    if row is None:
        return True
    fetched_at, attempted_at = row
    now = _now()
    if (
        coverage
        and coverage[0] == HISTORY_PERIOD
        and fetched_at
        and now - datetime.fromisoformat(fetched_at) < CACHE_TTL
        and (not require_currency or (quote and quote[0]))
    ):
        return False
    if (
        attempted_at
        and (not require_currency or attempted_at != fetched_at)
        and now - datetime.fromisoformat(attempted_at) < RETRY_AFTER
    ):
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


def _refresh(ticker: str, require_currency: bool = False) -> pd.Series:
    try:
        prices = _download(ticker)
        if prices.empty:
            raise NoPriceData(f"Yahoo returned no data for {ticker}")
        if require_currency and not prices.attrs.get("currency"):
            _check_usd(prices.attrs.get("currency"))
    except Exception:
        _record_failure(ticker)
        raise

    rows = [(ticker, d.date().isoformat(), float(p)) for d, p in prices.items()]
    stamp = _now().isoformat()
    with closing(_connect()) as conn:
        with conn:  # one transaction: readers never see a half-replaced series
            # Serialized insertion and eviction across processes, not just Python threads.
            conn.execute("BEGIN IMMEDIATE")
            # Adjusted prices change retroactively (dividends, splits), so
            # replace the whole series instead of appending new days.
            conn.execute("DELETE FROM prices WHERE ticker = ?", (ticker,))
            conn.executemany("INSERT INTO prices (ticker, date, close) VALUES (?, ?, ?)", rows)
            conn.execute(
                "INSERT INTO cache_metadata (ticker, history_period) VALUES (?, ?) "
                "ON CONFLICT(ticker) DO UPDATE SET history_period = excluded.history_period",
                (ticker, HISTORY_PERIOD),
            )
            conn.execute(
                "INSERT INTO fetch_log (ticker, fetched_at, attempted_at) VALUES (?, ?, ?) "
                "ON CONFLICT(ticker) DO UPDATE SET "
                "fetched_at = excluded.fetched_at, attempted_at = excluded.attempted_at",
                (ticker, stamp, stamp),
            )
            conn.execute(
                "INSERT INTO quote_metadata VALUES (?, ?, ?) "
                "ON CONFLICT(ticker) DO UPDATE SET currency = excluded.currency, "
                "last_accessed = excluded.last_accessed",
                (ticker, prices.attrs.get("currency"), stamp),
            )
            # Evicted least-recently-used quotes while retaining calibration data and this response.
            ordered = conn.execute(
                "SELECT p.ticker FROM (SELECT DISTINCT ticker FROM prices) p "
                "LEFT JOIN quote_metadata q ON p.ticker = q.ticker "
                "ORDER BY COALESCE(q.last_accessed, ''), p.ticker"
            ).fetchall()
            remaining = len(ordered)
            for (candidate,) in ordered:
                if remaining <= MAX_CACHED_TICKERS:
                    break
                if candidate in PROTECTED_TICKERS or candidate == ticker:
                    continue
                for table in ("prices", "fetch_log", "cache_metadata", "quote_metadata"):
                    conn.execute(f"DELETE FROM {table} WHERE ticker = ?", (candidate,))
                remaining -= 1
    return prices


def _has_data(ticker: str) -> bool:
    with closing(_connect()) as conn:
        return (
            conn.execute("SELECT 1 FROM prices WHERE ticker = ? LIMIT 1", (ticker,)).fetchone()
            is not None
        )


def cached_tickers() -> set[str]:
    with closing(_connect()) as conn:
        rows = conn.execute("SELECT DISTINCT ticker FROM prices").fetchall()
    return {ticker for (ticker,) in rows}


def _load(ticker: str) -> pd.Series:
    with closing(_connect()) as conn:
        rows = conn.execute(
            "SELECT date, close FROM prices WHERE ticker = ? ORDER BY date", (ticker,)
        ).fetchall()
        quote = conn.execute(
            "SELECT currency FROM quote_metadata WHERE ticker = ?", (ticker,)
        ).fetchone()
        with conn:
            conn.execute(
                "UPDATE quote_metadata SET last_accessed = ? WHERE ticker = ?",
                (_now().isoformat(), ticker),
            )
    if not rows:
        raise RuntimeError(f"No cached prices for {ticker} and Yahoo is unavailable right now")
    prices = pd.Series(
        [close for _, close in rows],
        index=pd.to_datetime([date for date, _ in rows]),
        name=ticker,
    )
    prices.attrs["currency"] = quote[0] if quote else None
    return prices


def cached_prices(ticker: str):
    # Exposed cached observations without initiating network I/O, allowing the
    # interactive forecast to respond while a background refresh was in progress.
    try:
        return _load(ticker)
    except RuntimeError:
        return pd.Series(dtype=float)


def cache_timestamp(ticker: str):
    with closing(_connect()) as conn:
        row = conn.execute(
            "SELECT fetched_at FROM fetch_log WHERE ticker = ?", (ticker,)
        ).fetchone()
    return row[0] if row else None


def get_prices(ticker: str, require_currency: bool = False) -> pd.Series:
    """Daily adjusted closing prices, served from SQLite when fresh enough."""
    ticker = ticker.upper()
    refreshed = None
    # Rechecked freshness while holding the process lock so concurrent requests
    # for the same stale ticker did not all repeat the same provider download.
    if _needs_refresh(ticker, require_currency):
        with _refresh_lock:
            if _needs_refresh(
                ticker, require_currency
            ):  # another request may have refreshed while we waited
                try:
                    refreshed = _refresh(ticker, require_currency)
                except UnsupportedCurrency:
                    raise
                except Exception:
                    if not _has_data(ticker):
                        raise  # nothing cached to fall back on
                    # otherwise keep serving the stale data
    # Returned the fetched series directly so another worker's eviction could not erase this response.
    prices = refreshed if refreshed is not None else _load(ticker)
    if require_currency:
        _check_usd(prices.attrs.get("currency"))
    return prices
