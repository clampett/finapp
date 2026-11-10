"""Current prices for crypto and foreign currencies, from Yahoo Finance.

Unlike the stock history in price_cache (refreshed daily), these are latest
quotes, kept in memory for QUOTE_TTL so repeated page loads do not hit Yahoo.
Only a fixed list of coins and currencies is supported, which keeps the number
of different requests to Yahoo small.
"""

import math
import re
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

QUOTE_TTL = timedelta(seconds=60)  # how long a quote is served without asking Yahoo again
STALE_LIMIT = timedelta(minutes=15)  # how long an old quote may stand in during an outage
CRYPTO_SYMBOL = re.compile(r"^[A-Z0-9]{1,15}(-USD)?$")
MAX_EXTRA_QUOTES = 100  # looked-up coins outside the supported list kept in the cache
UNKNOWN_TTL = timedelta(minutes=5)  # how long a coin Yahoo could not price is remembered

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
_unknown_until: dict[str, datetime] = {}
_store_lock = threading.Lock()
_COIN_NAMES = {ticker: name for ticker, name in CRYPTO.values()}
_SUPPORTED_TICKERS = set(_COIN_NAMES) | {t for t, _, _ in CURRENCIES.values()}


class UnknownSymbol(LookupError):
    """The coin or currency is not on the supported list."""


class InvalidSymbol(ValueError):
    """The coin symbol is not a plausible ticker."""


class QuoteUnavailable(RuntimeError):
    """Yahoo could not give a current price right now."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _fetch_quote(ticker: str) -> tuple[float, float]:
    import yfinance as yf  # imported here so the quotes can be tested without it

    info = yf.Ticker(ticker).fast_info
    last, previous = info.last_price, info.previous_close
    for value in (last, previous):
        if value is None or not math.isfinite(value) or value <= 0:
            raise QuoteUnavailable(f"Yahoo has no current price for {ticker}.")
    return float(last), float(previous)


def _quote(ticker: str) -> tuple[float, float, datetime]:
    """Latest price, previous close, and when they were fetched."""
    now = _now()
    cached = _cache.get(ticker)
    if cached and now - cached[0] < QUOTE_TTL:
        return cached[1], cached[2], cached[0]
    try:
        last, previous = _fetch_quote(ticker)
    except Exception:
        if cached and now - cached[0] < STALE_LIMIT:
            return cached[1], cached[2], cached[0]  # a slightly old price beats none
        raise QuoteUnavailable(f"Could not get a current price for {ticker} right now.")
    _store(ticker, now, last, previous)
    return last, previous, now

def _store(ticker: str, fetched_at: datetime, last: float, previous: float) -> None:
    with _store_lock:
        _cache[ticker] = (fetched_at, last, previous)
        extras = [t for t in list(_cache) if t not in _SUPPORTED_TICKERS]
        if len(extras) > MAX_EXTRA_QUOTES:
            _cache.pop(min(extras, key=lambda t: _cache[t][0]), None)
            

def _price(value: float) -> float:
    return round(value, 2) if value >= 1 else round(value, 6)


def _extra_coin_ticker(key: str) -> str:
    """The Yahoo ticker for a coin that is not on the supported list."""
    if not CRYPTO_SYMBOL.match(key):
        raise InvalidSymbol("Coin symbols are 1 to 15 letters or numbers (for example SOL).")
    return key if key.endswith("-USD") else f"{key}-USD"


def _extra_quote(ticker: str, asked: str) -> tuple[float, float, datetime]:
    now = _now()
    not_found = (
        f"Could not find a current price for '{asked.strip()}'. "
        "Check the symbol (for example SOL or AVAX-USD) and try again."
    )
    expires = _unknown_until.get(ticker)
    if expires and expires > now:
        raise UnknownSymbol(not_found)
    try:
        return _quote(ticker)
    except QuoteUnavailable:
        # Yahoo not knowing a coin looks the same as a short outage from here.
        if len(_unknown_until) >= 200:
            _unknown_until.pop(next(iter(_unknown_until)), None)
        _unknown_until[ticker] = now + UNKNOWN_TTL
        raise UnknownSymbol(not_found)


def crypto_quote(symbol: str) -> dict:
    key = symbol.strip().upper()
    if key in CRYPTO:
        ticker, name = CRYPTO[key]
        last, previous, as_of = _quote(ticker)
    else:
        ticker = _extra_coin_ticker(key)
        name = _COIN_NAMES.get(ticker)  # known when typed as BTC-USD
        last, previous, as_of = _extra_quote(ticker, symbol)
        key = ticker.removesuffix("-USD")
    return {
        "symbol": key,
        "name": name,
        "currency": "USD",
        "price": _price(last),
        "previous_close": _price(previous),
        "change": _price(last - previous),
        "change_percent": round((last / previous - 1) * 100, 2),
        "as_of": as_of.isoformat(timespec="seconds"),
    }


def currency_quote(code: str) -> dict:
    key = code.strip().upper()
    if key not in CURRENCIES:
        raise UnknownSymbol(f"Unsupported currency '{code}'. Supported: {', '.join(CURRENCIES)}.")
    ticker, name, dollars_per_unit = CURRENCIES[key]
    last, previous, as_of = _quote(ticker)
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


def _gather(keys, fetch_one) -> list[dict]:
    def attempt(key):
        try:
            return fetch_one(key)
        except QuoteUnavailable:
            return None  # one missing quote should not hide the others

    with ThreadPoolExecutor(max_workers=8) as pool:
        found = [item for item in pool.map(attempt, keys) if item is not None]
    if not found:
        raise QuoteUnavailable("Current prices are temporarily unavailable.")
    return found


def all_crypto() -> list[dict]:
    return _gather(list(CRYPTO), crypto_quote)


def all_currencies() -> list[dict]:
    return _gather(list(CURRENCIES), currency_quote)
