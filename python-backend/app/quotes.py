"""Current prices for crypto and foreign currencies, from Yahoo Finance.

Unlike the stock history in price_cache (refreshed daily), these are latest
quotes, kept in memory for QUOTE_TTL so repeated page loads do not hit Yahoo.
The market panels use fixed lists, with a bounded lookup budget for other coins.
"""

import math
import re
import threading
from collections import deque
from concurrent.futures import Future, ThreadPoolExecutor, wait
from datetime import datetime, timedelta, timezone

QUOTE_TTL = timedelta(seconds=60)  # how long a quote is served without asking Yahoo again
STALE_LIMIT = timedelta(minutes=15)  # how long an old quote may stand in during an outage
CRYPTO_SYMBOL = re.compile(r"^[A-Z0-9]{1,15}(-USD)?$")
MAX_EXTRA_QUOTES = 100  # looked-up coins outside the supported list kept in the cache
UNKNOWN_TTL = timedelta(minutes=5)  # how long a coin Yahoo could not price is remembered
RETRY_DELAY = timedelta(seconds=30)
MAX_NEW_LOOKUPS_PER_MINUTE = 20
MAX_PENDING_LOOKUPS = 4
MAX_PENDING_QUOTES = 32
QUOTE_WAIT_SECONDS = 9

# Coin symbol -> (Yahoo ticker, name). Prices are quoted in US dollars.
CRYPTO = {
    "BTC": ("BTC-USD", "Bitcoin"),
    "ETH": ("ETH-USD", "Ethereum"),
    "SOL": ("SOL-USD", "Solana"),
    "XRP": ("XRP-USD", "XRP"),
    "ADA": ("ADA-USD", "Cardano"),
    "LTC": ("LTC-USD", "Litecoin"),
    "BNB": ("BNB-USD", "BNB"),
}

# Currency code -> (Yahoo ticker, name, dollars_per_unit).
# Yahoo quotes some pairs as dollars per unit (EURUSD=X) and others as units per
# dollar (JPY=X). dollars_per_unit says which kind the ticker is. EUR, GBP, JPY,
# and CAD were checked against Yahoo; the rest follow Yahoo's usual convention.
CURRENCIES = {
    "EUR": ("EURUSD=X", "Euro", True),
    "GBP": ("GBPUSD=X", "British Pound", True),
    "JPY": ("JPY=X", "Japanese Yen", False),
    "CAD": ("USDCAD=X", "Canadian Dollar", False),
    "AUD": ("AUDUSD=X", "Australian Dollar", True),
    "CHF": ("CHF=X", "Swiss Franc", False),
    "MXN": ("MXN=X", "Mexican Peso", False),
    "INR": ("INR=X", "Indian Rupee", False),
    "CNY": ("CNY=X", "Chinese Yuan", False),
}

# ticker -> (when it was fetched, latest price, previous close)
_cache: dict[str, tuple[datetime, float, float]] = {}
_failures: dict[str, tuple[datetime, type[Exception]]] = {}
_pending: dict[str, Future] = {}
_lookup_times: deque[datetime] = deque()
_store_lock = threading.Lock()
_workers = ThreadPoolExecutor(max_workers=16, thread_name_prefix="finapp-quotes")
_COIN_NAMES = {ticker: name for ticker, name in CRYPTO.values()}
_SUPPORTED_TICKERS = set(_COIN_NAMES) | {t for t, _, _ in CURRENCIES.values()}


class UnknownSymbol(LookupError):
    """The requested coin or currency could not be found."""


class InvalidSymbol(ValueError):
    """The coin symbol is not a plausible ticker."""


class QuoteUnavailable(RuntimeError):
    """Yahoo could not give a current price right now."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _fetch_quote(ticker: str) -> tuple[float, float]:
    import yfinance as yf  # imported here so the quotes can be tested without it
    from yfinance.exceptions import YFPricesMissingError

    # Requested recent unadjusted closes with a bounded provider timeout.
    try:
        history = yf.Ticker(ticker).history(
            period="5d", interval="1d", auto_adjust=False, timeout=4, raise_errors=True
        )
    except YFPricesMissingError as failure:
        reason = (failure.yahoo_reason or "").lower()
        if "no data found" in reason or "symbol not found" in reason:
            raise UnknownSymbol(f"No quote was found for {ticker}.") from failure
        raise
    closes = history["Close"].dropna().sort_index()
    if len(closes) < 2:
        raise QuoteUnavailable(f"Yahoo has insufficient price history for {ticker}.")
    last, previous = closes.iloc[-1], closes.iloc[-2]
    for value in (last, previous):
        if not math.isfinite(value) or value <= 0:
            raise QuoteUnavailable(f"Yahoo has no current price for {ticker}.")
    return float(last), float(previous)


def _cached_quote(cached, now):
    if cached and now - cached[0] < STALE_LIMIT:
        return cached[1], cached[2], cached[0]
    return None


def _refresh(ticker: str, cached) -> tuple[float, float, datetime]:
    try:
        last, previous = _fetch_quote(ticker)
    except Exception as failure:
        now = _now()
        # Remembered provider failures without turning transient outages into missing coins.
        missing = isinstance(failure, UnknownSymbol)
        kind = UnknownSymbol if missing else QuoteUnavailable
        with _store_lock:
            _failures[ticker] = (now + (UNKNOWN_TTL if missing else RETRY_DELAY), kind)
            if len(_failures) > 200:
                _failures.pop(next(iter(_failures)))
        stale = _cached_quote(cached, now)
        if stale:
            return stale  # a slightly old price beats none
        raise kind(f"Could not get a current price for {ticker}.") from failure
    fetched_at = _now()
    with _store_lock:
        _cache[ticker] = (fetched_at, last, previous)
        extras = [key for key in _cache if key not in _SUPPORTED_TICKERS]
        if len(extras) > MAX_EXTRA_QUOTES:
            _cache.pop(min(extras, key=lambda key: _cache[key][0]))
    return last, previous, fetched_at


def _forget_request(ticker: str, future: Future) -> None:
    with _store_lock:
        if _pending.get(ticker) is future:
            _pending.pop(ticker)


def _resolved(value) -> Future:
    future = Future()
    future.set_result(value)
    return future


def _request_quote(ticker: str) -> Future:
    # Shared each pending ticker across list, lookup, and concurrent dashboard requests.
    with _store_lock:
        now = _now()
        cached = _cache.get(ticker)
        stale = _cached_quote(cached, now)
        if stale and now - cached[0] < QUOTE_TTL:
            return _resolved(stale)
        pending = _pending.get(ticker)
        if pending and not pending.done():
            return pending
        _pending.pop(ticker, None)
        failure = _failures.get(ticker)
        if failure and now < failure[0]:
            if stale:
                return _resolved(stale)
            raise failure[1](f"Could not get a current price for {ticker}.")
        _failures.pop(ticker, None)
        if len(_pending) >= MAX_PENDING_QUOTES:
            if stale:
                return _resolved(stale)
            raise QuoteUnavailable("Market data is busy. Try again shortly.")
        # Capped uncached coin lookup traffic while keeping the standard market panels available.
        if ticker not in _SUPPORTED_TICKERS:
            while _lookup_times and now - _lookup_times[0] >= QUOTE_TTL:
                _lookup_times.popleft()
            pending_lookups = sum(
                key not in _SUPPORTED_TICKERS and not job.done() for key, job in _pending.items()
            )
            if (
                len(_lookup_times) >= MAX_NEW_LOOKUPS_PER_MINUTE
                or pending_lookups >= MAX_PENDING_LOOKUPS
            ):
                if stale:
                    return _resolved(stale)
                raise QuoteUnavailable("Coin lookups are busy. Try again in a minute.")
            _lookup_times.append(now)
        future = _workers.submit(_refresh, ticker, cached)
        _pending[ticker] = future
    future.add_done_callback(lambda completed: _forget_request(ticker, completed))
    return future


def _quote(ticker: str) -> tuple[float, float, datetime]:
    """Latest price, previous close, and when they were fetched."""
    try:
        return _request_quote(ticker).result(timeout=QUOTE_WAIT_SECONDS)
    except TimeoutError as failure:
        with _store_lock:
            stale = _cached_quote(_cache.get(ticker), _now())
        if stale:
            return stale
        raise QuoteUnavailable(
            "Market data took too long to respond. Try again shortly."
        ) from failure


def _extra_coin_ticker(key: str) -> str:
    """The Yahoo ticker for a coin that is not on the supported list."""
    if not CRYPTO_SYMBOL.fullmatch(key):
        raise InvalidSymbol("Coin symbols are 1 to 15 letters or numbers (for example SOL).")
    return key if key.endswith("-USD") else f"{key}-USD"


def crypto_quote(symbol: str) -> dict:
    ticker = _extra_coin_ticker(symbol.strip().upper())
    try:
        return _crypto_result(ticker, _quote(ticker))
    except UnknownSymbol as failure:
        raise UnknownSymbol(
            f"No quote was found for {ticker}. Check the coin symbol and try again."
        ) from failure


def _crypto_result(ticker, quote) -> dict:
    last, previous, as_of = quote
    return {
        "symbol": ticker.removesuffix("-USD"),
        "name": _COIN_NAMES.get(ticker),  # known when typed as BTC-USD
        "currency": "USD",
        "price": last,
        "previous_close": previous,
        "change": last - previous,
        "change_percent": round((last / previous - 1) * 100, 2),
        "as_of": as_of.isoformat(timespec="seconds"),
    }


def currency_quote(code: str) -> dict:
    key = code.strip().upper()
    if key not in CURRENCIES:
        raise UnknownSymbol(f"Unsupported currency '{code}'. Supported: {', '.join(CURRENCIES)}.")
    return _currency_result(key, _quote(CURRENCIES[key][0]))


def _currency_result(key, quote) -> dict:
    _, name, dollars_per_unit = CURRENCIES[key]
    last, previous, as_of = quote
    now_usd, before_usd = (last, previous) if dollars_per_unit else (1 / last, 1 / previous)
    return {
        "code": key,
        "name": name,
        "per_usd": round(1 / now_usd, 4),  # units of this currency for one dollar
        "usd_per_unit": round(now_usd, 6),  # dollars for one unit of this currency
        # How much the currency's value in dollars moved since the previous close.
        "change_percent": round((now_usd / before_usd - 1) * 100, 2),
        "as_of": as_of.isoformat(timespec="seconds"),
    }


def _gather(entries, build_result) -> list[dict]:
    requests = []
    for key, ticker in entries:
        try:
            requests.append((key, ticker, _request_quote(ticker)))
        except (QuoteUnavailable, UnknownSymbol):
            continue  # one missing quote should not hide the others
    # Applied one deadline to the list and retained the original display order.
    done, _ = wait((future for _, _, future in requests), timeout=QUOTE_WAIT_SECONDS)
    found = []
    for key, ticker, future in requests:
        try:
            if future in done:
                quote = future.result()
            else:
                with _store_lock:
                    quote = _cached_quote(_cache.get(ticker), _now())
            if quote:
                found.append(build_result(key, quote))
        except (QuoteUnavailable, UnknownSymbol):
            continue
    if not found:
        raise QuoteUnavailable("Current prices are temporarily unavailable.")
    return found


def all_crypto() -> list[dict]:
    return _gather(((ticker, ticker) for ticker, _ in CRYPTO.values()), _crypto_result)


def all_currencies() -> list[dict]:
    return _gather(((code, item[0]) for code, item in CURRENCIES.items()), _currency_result)
