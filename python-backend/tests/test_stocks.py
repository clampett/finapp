import sys
from datetime import datetime, timezone
from types import SimpleNamespace

import pandas as pd
import pytest
from fastapi import HTTPException

from app import price_cache, stocks
from app.routers import stocks as stocks_router


def make_prices(growth: float = 0.10, periods: int = 2610) -> pd.Series:
    """Business-day prices growing smoothly at `growth` per year."""
    index = pd.bdate_range(end="2026-10-07", periods=periods)
    years = (index - index[0]).days / 365.25
    return pd.Series(100 * (1 + growth) ** years, index=index)


@pytest.fixture
def market(tmp_path, monkeypatch):
    # Isolated storage and a fake Yahoo, so lookups never touch the network.
    monkeypatch.setenv("PRICE_CACHE_DB", str(tmp_path / "cache.db"))
    state = {
        "calls": 0,
        "fail": False,
        "empty": False,
        "periods": 2610,
        "now": datetime(2026, 10, 24, tzinfo=timezone.utc),
    }

    def fake_download(ticker):
        state["calls"] += 1
        if state["fail"]:
            raise ConnectionError("yahoo is down")
        if state["empty"]:
            return pd.Series(dtype=float)
        return make_prices(periods=state["periods"])

    monkeypatch.setattr(price_cache, "_download", fake_download)
    monkeypatch.setattr(price_cache, "_now", lambda: state["now"])
    monkeypatch.setattr(stocks, "_unknown_until", {})
    return state


def status_of(call, *args):
    try:
        call(*args)
    except HTTPException as error:
        return error.status_code
    return 200


def test_symbols_are_cleaned_up():
    assert stocks.normalize_symbol(" aapl ") == "AAPL"
    assert stocks.normalize_symbol("brk.b") == "BRK.B"


def test_malformed_symbols_are_rejected():
    for bad in ["", "A B", "../etc", "WAYTOOLONGSYMBOL", "$AAPL", "-AAPL", ".AAPL"]:
        with pytest.raises(stocks.InvalidSymbol):
            stocks.normalize_symbol(bad)


def test_lookup_returns_price_stats_and_a_year_of_history(market):
    result = stocks.lookup_stock("aapl")
    assert result["symbol"] == "AAPL"
    assert result["name"] == "Apple"
    assert result["latest_price"] > 0
    assert len(result["history"]) == 252
    assert result["history"][-1]["date"] == result["latest_date"]
    assert abs(result["cagr"] - 0.10) < 0.002


def test_symbols_outside_the_popular_list_have_no_name(market):
    assert stocks.lookup_stock("ZZZZ")["name"] is None


def test_recent_listings_show_a_price_but_no_annualized_stats(market):
    market["periods"] = 100
    result = stocks.lookup_stock("NEWCO")
    assert result["latest_price"] > 0
    assert len(result["history"]) == 100
    assert result["cagr"] is None
    assert result["annual_volatility"] is None


def test_unknown_symbols_are_not_found_and_remembered(market):
    market["empty"] = True
    for _ in range(3):
        with pytest.raises(stocks.SymbolNotFound):
            stocks.lookup_stock("ZZZZ")
    assert market["calls"] == 1  # Yahoo was only asked once


def test_an_outage_is_not_reported_as_not_found(market):
    market["fail"] = True
    with pytest.raises(ConnectionError):
        stocks.lookup_stock("AAPL")


def test_a_full_cache_blocks_new_symbols_but_not_popular_ones(market, monkeypatch):
    monkeypatch.setattr(stocks, "MAX_CACHED_TICKERS", 2)
    stocks.lookup_stock("AAA")
    stocks.lookup_stock("BBB")
    with pytest.raises(stocks.TooManySymbols):
        stocks.lookup_stock("CCC")
    assert stocks.lookup_stock("AAA")["symbol"] == "AAA"  # already cached
    assert stocks.lookup_stock("AAPL")["symbol"] == "AAPL"  # popular


def test_endpoint_status_codes(market):
    assert status_of(stocks_router.stock, "AAPL") == 200
    assert status_of(stocks_router.stock, "bad symbol") == 400
    market["empty"] = True
    assert status_of(stocks_router.stock, "ZZZZ") == 404
    market["empty"] = False
    market["fail"] = True
    assert status_of(stocks_router.stock, "MSFT") == 503


def test_popular_stocks_endpoint_lists_the_suggestions():
    listed = stocks_router.popular_stocks()
    assert listed[0] == {"symbol": "VOO", "name": "Vanguard S&P 500 ETF"}
    assert len(listed) == len(stocks.POPULAR_STOCKS)


def test_download_returns_nothing_for_unknown_symbols(monkeypatch):
    class FakeTicker:
        def __init__(self, symbol):
            pass

        def history(self, **kwargs):
            return pd.DataFrame()

    monkeypatch.setitem(sys.modules, "yfinance", SimpleNamespace(Ticker=FakeTicker))
    assert price_cache._download("ZZZZ").empty


def test_download_drops_missing_prices(monkeypatch):
    class FakeTicker:
        def __init__(self, symbol):
            pass

        def history(self, **kwargs):
            index = pd.bdate_range("2026-10-01", periods=3)
            return pd.DataFrame({"Close": [1.0, None, 3.0]}, index=index)

    monkeypatch.setitem(sys.modules, "yfinance", SimpleNamespace(Ticker=FakeTicker))
    assert list(price_cache._download("AAPL")) == [1.0, 3.0]
