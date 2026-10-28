import sys
from concurrent.futures import ThreadPoolExecutor
from contextlib import nullcontext
from datetime import datetime, timedelta, timezone
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
        "currency": "USD",
        "now": datetime(2026, 10, 24, tzinfo=timezone.utc),
    }

    def fake_download(ticker):
        state["calls"] += 1
        if state["fail"]:
            raise ConnectionError("yahoo is down")
        if state["empty"]:
            return pd.Series(dtype=float)
        prices = make_prices(periods=state["periods"])
        prices.attrs["currency"] = state["currency"]
        return prices

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


def test_a_full_cache_evicts_the_oldest_quote_instead_of_blocking(market, monkeypatch):
    monkeypatch.setattr(price_cache, "MAX_CACHED_TICKERS", 2)
    stocks.lookup_stock("AAA")
    market["now"] += timedelta(seconds=1)
    stocks.lookup_stock("BBB")
    assert stocks.lookup_stock("AAA")["symbol"] == "AAA"  # already cached
    market["now"] += timedelta(seconds=1)
    assert stocks.lookup_stock("CCC")["symbol"] == "CCC"
    assert price_cache.cached_tickers() == {"BBB", "CCC"}
    assert stocks.lookup_stock("AAPL")["symbol"] == "AAPL"  # popular
    assert len(price_cache.cached_tickers()) == 2


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
        def get_history_metadata(self):
            return {"currency": "USD"}

        def __init__(self, symbol):
            pass

        def history(self, **kwargs):
            return pd.DataFrame()

    monkeypatch.setitem(sys.modules, "yfinance", SimpleNamespace(Ticker=FakeTicker))
    assert price_cache._download("ZZZZ").empty


def test_download_drops_missing_prices(monkeypatch):
    class FakeTicker:
        def get_history_metadata(self):
            return {"currency": "USD"}

        def __init__(self, symbol):
            pass

        def history(self, **kwargs):
            index = pd.bdate_range("2026-10-01", periods=3)
            return pd.DataFrame({"Close": [1.0, None, 3.0]}, index=index)

    monkeypatch.setitem(sys.modules, "yfinance", SimpleNamespace(Ticker=FakeTicker))
    assert list(price_cache._download("AAPL")) == [1.0, 3.0]


def test_foreign_currency_is_rejected_including_cached_requests(market):
    market["currency"] = "GBp"
    assert status_of(stocks_router.stock, "VOD.L") == 400
    assert status_of(stocks_router.stock, "VOD.L") == 400
    assert market["calls"] == 1


def test_unverified_currency_is_not_assumed_to_be_usd(market):
    market["currency"] = None
    assert status_of(stocks_router.stock, "AAPL") == 503
    assert "AAPL" not in price_cache.cached_tickers()


def test_legacy_cached_prices_are_refreshed_to_verify_currency(market):
    market["currency"] = None
    price_cache.get_prices("AAA")
    market["currency"] = "USD"
    market["now"] += timedelta(seconds=1)
    result = stocks.lookup_stock("AAA")
    assert result["currency"] == "USD"
    assert market["calls"] == 2


def test_shorter_history_reports_its_actual_statistics_period(market):
    market["periods"] = 520
    result = stocks.lookup_stock("NEWCO")
    prices = make_prices(periods=520)
    assert result["stats_start_date"] == prices.index[0].date().isoformat()
    assert result["stats_end_date"] == result["latest_date"]
    assert result["cagr"] is not None


def test_less_than_a_calendar_year_does_not_get_annualized(market):
    market["periods"] = 252
    result = stocks.lookup_stock("NEWCO")
    assert result["cagr"] is None
    assert result["stats_start_date"] is None


def test_eviction_uses_last_access_and_preserves_simulation_benchmarks(market, monkeypatch):
    monkeypatch.setattr(price_cache, "MAX_CACHED_TICKERS", 3)
    for symbol in ("SPY", "AAA", "BBB"):
        stocks.lookup_stock(symbol)
        market["now"] += timedelta(seconds=1)
    stocks.lookup_stock("AAA")
    market["now"] += timedelta(seconds=1)
    stocks.lookup_stock("CCC")
    assert price_cache.cached_tickers() == {"SPY", "AAA", "CCC"}


def test_eviction_is_atomic_without_the_process_local_lock(market, monkeypatch):
    monkeypatch.setattr(price_cache, "MAX_CACHED_TICKERS", 3)
    # Bypassed the thread lock to exercise independent-worker SQLite transactions.
    monkeypatch.setattr(price_cache, "_refresh_lock", nullcontext())
    with ThreadPoolExecutor(max_workers=8) as executor:
        results = list(executor.map(stocks.lookup_stock, [f"STK{i}" for i in range(8)]))
    assert len(results) == 8
    assert len(price_cache.cached_tickers()) == 3


def test_cached_currency_survives_an_outage(market):
    stocks.lookup_stock("AAPL")
    market["now"] += timedelta(hours=25)
    market["fail"] = True
    result = stocks.lookup_stock("AAPL")
    assert result["currency"] == "USD"
    assert result["latest_price"] > 0
