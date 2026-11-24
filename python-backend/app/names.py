"""Display names for stocks and coins that are not in our built-in lists.

Yahoo is asked once per symbol and the answer is kept in memory, because a company's name
almost never changes. A failed lookup never breaks a price: the name is simply left out and
tried again after a short wait.
"""

import re
import threading
from concurrent.futures import ThreadPoolExecutor, TimeoutError
from datetime import datetime, timedelta, timezone

RETRY_AFTER = timedelta(minutes=10)  # how long a missing name is left alone
MAX_NAMES = 500  # bounds both dictionaries, so memory stays small

_names: dict[str, str] = {}
_retry_at: dict[str, datetime] = {}
_lock = threading.Lock()
_workers = ThreadPoolExecutor(max_workers=4, thread_name_prefix="market-name")
_pending = {}
NAME_WAIT_SECONDS = 0.15  # optional metadata must not hold up a valid price


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _fetch_name(ticker: str) -> str | None:
    import yfinance as yf  # imported here so the tests can run without it

    info = yf.Ticker(ticker).info
    for field in ("shortName", "longName"):
        value = info.get(field)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def lookup_name(ticker: str) -> str | None:
    """Yahoo's name for a ticker, or None when it has none or could not be reached."""
    now = _now()
    created = False
    with _lock:
        if ticker in _names:
            return _names[ticker]
        if _retry_at.get(ticker, now) > now:
            return None  # asked recently and got nothing, so do not ask again yet
        future = _pending.get(ticker)
        if future is None:
            if len(_pending) >= 4:
                return None  # no unbounded queue when the provider is unavailable
            future = _workers.submit(_load_name, ticker)
            _pending[ticker] = future
            created = True
    # Register outside the lock: an already-finished future invokes this inline.
    if created:
        future.add_done_callback(lambda completed: _forget_pending(ticker, completed))
    try:
        return future.result(timeout=NAME_WAIT_SECONDS)
    except TimeoutError:
        return None


def _forget_pending(ticker, future):
    with _lock:
        if _pending.get(ticker) is future:
            _pending.pop(ticker, None)


def _load_name(ticker: str) -> str | None:
    try:
        name = _fetch_name(ticker)
    except Exception:
        name = None
    with _lock:
        table = _names if name else _retry_at
        if ticker not in table and len(table) >= MAX_NAMES:
            table.pop(next(iter(table)))
        if name:
            _names[ticker] = name
            _retry_at.pop(ticker, None)
        else:
            _retry_at[ticker] = _now() + RETRY_AFTER
    return name


def coin_name(ticker: str) -> str | None:
    """Yahoo names coins like 'Avalanche USD'; the display name drops the trailing USD."""
    name = lookup_name(ticker)
    return re.sub(r"\s+USD$", "", name) or None if name else None
