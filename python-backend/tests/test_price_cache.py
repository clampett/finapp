from datetime import datetime, timedelta, timezone

import pandas as pd
import pytest

from app import price_cache
from app.market_data import get_market_stats


def make_prices(growth: float) -> pd.Series:
    """About 10 years of business-day prices growing smoothly at `growth` per year."""
    index = pd.bdate_range(end="2026-10-07", periods=2610)
    years = (index - index[0]).days / 365.25
    return pd.Series(100 * (1 + growth) ** years, index=index)


@pytest.fixture
def cache(tmp_path, monkeypatch):
    # Isolated SQLite storage, provider responses, and time from the real machine,
    # allowing freshness and outage behavior to be tested without network requests.
    monkeypatch.setenv("PRICE_CACHE_DB", str(tmp_path / "cache.db"))
    state = {
        "calls": 0,
        "fail": False,
        "growth": 0.10,
        "now": datetime(2026, 10, 8, tzinfo=timezone.utc),
    }

    def fake_download(ticker):
        state["calls"] += 1
        if state["fail"]:
            raise ConnectionError("yahoo is down")
        return make_prices(state["growth"])

    monkeypatch.setattr(price_cache, "_download", fake_download)
    monkeypatch.setattr(price_cache, "_now", lambda: state["now"])
    return state


def test_second_request_uses_the_cache(cache):
    price_cache.get_prices("VOO")
    price_cache.get_prices("VOO")
    assert cache["calls"] == 1


def test_tickers_are_cached_separately(cache):
    price_cache.get_prices("VOO")
    price_cache.get_prices("AGG")
    assert cache["calls"] == 2


def test_refetches_after_the_ttl(cache):
    price_cache.get_prices("VOO")
    cache["now"] += timedelta(hours=25)
    price_cache.get_prices("VOO")
    assert cache["calls"] == 2


def test_serves_stale_data_when_yahoo_fails_and_backs_off(cache):
    price_cache.get_prices("VOO")
    cache["now"] += timedelta(hours=25)
    cache["fail"] = True
    assert not price_cache.get_prices("VOO").empty  # stale, but still served
    price_cache.get_prices("VOO")
    price_cache.get_prices("VOO")
    assert cache["calls"] == 2  # the first fetch plus one failed retry, no hammering


def test_raises_when_yahoo_fails_and_nothing_is_cached(cache):
    cache["fail"] = True
    with pytest.raises(ConnectionError):
        price_cache.get_prices("VOO")


def test_failed_first_fetch_is_not_retried_immediately(cache):
    cache["fail"] = True
    for _ in range(3):
        with pytest.raises(Exception):
            price_cache.get_prices("VOO")
    assert cache["calls"] == 1


def test_refresh_replaces_old_rows(cache):
    first = price_cache.get_prices("VOO")
    cache["now"] += timedelta(hours=25)
    cache["growth"] = 0.05
    second = price_cache.get_prices("VOO")
    assert len(second) == len(first)  # no duplicate rows
    assert second.iloc[-1] != first.iloc[-1]  # new values won


def test_stats_recover_known_growth(cache):
    stats = get_market_stats("US_STOCKS")
    assert stats["ticker"] == "VOO"
    assert abs(stats["cagr"] - 0.10) < 0.002
    assert stats["annual_volatility"] < 0.02


def test_unknown_asset_class_is_rejected(cache):
    with pytest.raises(ValueError):
        get_market_stats("CRYPTO")


def test_expected_return_is_the_average_not_the_compounded_return(monkeypatch):
    import numpy as np

    from app import market_data

    rng = np.random.default_rng(0)
    returns = rng.normal(0.0005, 0.011, 2610)
    index = pd.bdate_range(end="2026-10-07", periods=2610)
    prices = pd.Series(100 * np.cumprod(1 + returns), index=index)
    monkeypatch.setattr(market_data, "get_prices", lambda ticker: prices)

    stats = get_market_stats("US_STOCKS")
    assert stats["expected_annual_return"] > stats["cagr"]  # volatility drag
    gap = stats["expected_annual_return"] - stats["cagr"]
    assert abs(gap - stats["annual_volatility"] ** 2 / 2) < 0.01
