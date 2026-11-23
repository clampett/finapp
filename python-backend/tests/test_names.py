from datetime import datetime, timedelta, timezone

import pytest

from app import names, quotes


@pytest.fixture
def yahoo_names(monkeypatch):
    # A fake Yahoo that knows a few names and counts how often it is asked.
    state = {
        "calls": [],
        "known": {"COST": "Costco Wholesale Corporation", "AVAX-USD": "Avalanche USD"},
        "down": False,
        "now": datetime(2026, 11, 23, tzinfo=timezone.utc),
    }

    def fake_fetch(ticker):
        state["calls"].append(ticker)
        if state["down"]:
            raise ConnectionError("yahoo is down")
        return state["known"].get(ticker)

    monkeypatch.setattr(names, "_fetch_name", fake_fetch)
    monkeypatch.setattr(names, "_now", lambda: state["now"])
    return state


def test_a_name_is_looked_up_once_and_then_remembered(yahoo_names):
    assert names.lookup_name("COST") == "Costco Wholesale Corporation"
    assert names.lookup_name("COST") == "Costco Wholesale Corporation"
    assert yahoo_names["calls"] == ["COST"]


def test_a_missing_name_is_not_asked_for_again_right_away(yahoo_names):
    assert names.lookup_name("ZZZZ") is None
    assert names.lookup_name("ZZZZ") is None
    assert yahoo_names["calls"] == ["ZZZZ"]
    yahoo_names["now"] += names.RETRY_AFTER + timedelta(seconds=1)
    assert names.lookup_name("ZZZZ") is None
    assert yahoo_names["calls"] == ["ZZZZ", "ZZZZ"]


def test_yahoo_being_down_gives_no_name_instead_of_an_error(yahoo_names):
    yahoo_names["down"] = True
    assert names.lookup_name("COST") is None
    yahoo_names["down"] = False
    yahoo_names["now"] += names.RETRY_AFTER + timedelta(seconds=1)
    assert names.lookup_name("COST") == "Costco Wholesale Corporation"


def test_coin_names_drop_the_trailing_usd(yahoo_names):
    assert names.coin_name("AVAX-USD") == "Avalanche"
    assert names.coin_name("NOPE-USD") is None


def test_the_name_cache_stays_bounded(yahoo_names, monkeypatch):
    monkeypatch.setattr(names, "MAX_NAMES", 2)
    for symbol in ("COST", "AVAX-USD", "ZZZZ", "YYYY"):
        names.lookup_name(symbol)
    assert len(names._names) <= 2
    assert len(names._retry_at) <= 2


def test_a_coin_outside_the_list_gets_its_name_from_yahoo(yahoo_names, monkeypatch):
    monkeypatch.setattr(quotes, "_quote", lambda ticker: (30.0, 29.0, yahoo_names["now"]))
    assert quotes.crypto_quote("avax")["name"] == "Avalanche"
    assert quotes.crypto_quote("btc")["name"] == "Bitcoin"  # built-in names are not looked up
    assert "BTC-USD" not in yahoo_names["calls"]
