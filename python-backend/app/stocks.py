"""Stock lookup by symbol, built on the price cache.

Any well-formed symbol can be looked up, but Yahoo is protected three ways:
symbols are format-checked before any network call, symbols Yahoo does not
know are remembered for a while, and the number of different symbols kept in
the cache is capped.
"""

import re
from datetime import datetime, timedelta, timezone

from app.market_data import get_ticker_stats
from app.price_cache import NoPriceData, get_prices

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
# Enforced the shared cache limit transactionally in price_cache, including popular symbols.
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

    # Removed expired negative entries and bounded retained failures as well as valid quotes.
    for key, expiry in list(_unknown_until.items()):
        if expiry <= now:
            _unknown_until.pop(key, None)

    expires = _unknown_until.get(symbol)
    if expires and expires > now:
        raise SymbolNotFound(f"No price data found for '{symbol}'.")

    try:
        prices = get_prices(symbol, require_currency=True)
    except NoPriceData:
        if len(_unknown_until) >= 200:
            _unknown_until.pop(next(iter(_unknown_until)), None)
        _unknown_until[symbol] = now + UNKNOWN_TTL
        raise SymbolNotFound(f"No price data found for '{symbol}'.")

    # Required an elapsed calendar year as well as sufficient observations before annualizing.
    enough_history = (
        len(prices) >= MIN_STATS_POINTS and (prices.index[-1] - prices.index[0]).days >= 365
    )
    if enough_history:
        stats = get_ticker_stats(symbol, prices=prices)
    else:  # a recent listing: show the price, but don't annualize a few weeks
        stats = {"cagr": None, "expected_annual_return": None, "annual_volatility": None}

    recent = prices.tail(HISTORY_POINTS)
    return {
        "symbol": symbol,
        "name": POPULAR_STOCKS.get(symbol),
        "currency": prices.attrs["currency"],
        "stats_start_date": stats.get("start_date"),
        "stats_end_date": stats.get("end_date"),
        "latest_price": round(float(prices.iloc[-1]), 2),
        "latest_date": prices.index[-1].date().isoformat(),
        **{key: stats[key] for key in ("cagr", "expected_annual_return", "annual_volatility")},
        "history": [
            {"date": day.date().isoformat(), "close": round(float(close), 2)}
            for day, close in recent.items()
        ],
    }
