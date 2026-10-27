"""Stock lookup by symbol, built on the price cache.

Any well-formed symbol can be looked up, but Yahoo is protected three ways:
symbols are format-checked before any network call, symbols Yahoo does not
know are remembered for a while, and the number of different symbols kept in
the cache is capped.
"""

import re
from datetime import datetime, timedelta, timezone

from app.market_data import get_ticker_stats
from app.price_cache import NoPriceData, cached_tickers, get_prices

# Suggested in the Investing tab before anyone types a symbol.
POPULAR_STOCKS = {
    "VOO": "Vanguard S&P 500 ETF",
    "AGG": "iShares Core U.S. Aggregate Bond ETF",
    "VXUS": "Vanguard Total International Stock ETF",
    "VNQ": "Vanguard Real Estate ETF",
    "AAPL": "Apple",
    "MSFT": "Microsoft",
    "GOOGL": "Alphabet (Google)",
    "AMZN": "Amazon",
    "NVDA": "NVIDIA",
    "TSLA": "Tesla",
    "JPM": "JPMorgan Chase",
    "KO": "Coca-Cola",
    "JNJ": "Johnson & Johnson",
}

SYMBOL_PATTERN = re.compile(r"^[A-Z0-9][A-Z0-9.\-]{0,9}$")
MAX_CACHED_TICKERS = 200  # distinct symbols kept in the cache
UNKNOWN_TTL = timedelta(hours=1)  # how long a symbol Yahoo does not know is remembered
HISTORY_POINTS = 252  # about one year of trading days, for the chart
MIN_STATS_POINTS = 252  # under a year of prices is too short to annualize

_unknown_until: dict[str, datetime] = {}


class InvalidSymbol(ValueError):
    """The symbol is not a plausible ticker."""


class SymbolNotFound(LookupError):
    """Yahoo has no price history for the symbol."""


class TooManySymbols(RuntimeError):
    """The cache is full of other symbols."""


def normalize_symbol(raw: str) -> str:
    symbol = raw.strip().upper()
    if not SYMBOL_PATTERN.match(symbol):
        raise InvalidSymbol(
            "Symbols are 1 to 10 letters, numbers, dots, or dashes (for example AAPL)."
        )
    return symbol


def lookup_stock(raw_symbol: str) -> dict:
    symbol = normalize_symbol(raw_symbol)
    now = datetime.now(timezone.utc)

    expires = _unknown_until.get(symbol)
    if expires and expires > now:
        raise SymbolNotFound(f"No price data found for '{symbol}'.")

    cached = cached_tickers()
    if symbol not in cached and symbol not in POPULAR_STOCKS and len(cached) >= MAX_CACHED_TICKERS:
        raise TooManySymbols("Too many different symbols have been looked up. Try again later.")

    try:
        prices = get_prices(symbol)
    except NoPriceData:
        _unknown_until[symbol] = now + UNKNOWN_TTL
        raise SymbolNotFound(f"No price data found for '{symbol}'.")

    if len(prices) >= MIN_STATS_POINTS:
        stats = get_ticker_stats(symbol)
    else:  # a recent listing: show the price, but don't annualize a few weeks
        stats = {"cagr": None, "expected_annual_return": None, "annual_volatility": None}

    recent = prices.tail(HISTORY_POINTS)
    return {
        "symbol": symbol,
        "name": POPULAR_STOCKS.get(symbol),
        "latest_price": round(float(prices.iloc[-1]), 2),
        "latest_date": prices.index[-1].date().isoformat(),
        **{key: stats[key] for key in ("cagr", "expected_annual_return", "annual_volatility")},
        "history": [
            {"date": day.date().isoformat(), "close": round(float(close), 2)}
            for day, close in recent.items()
        ],
    }
