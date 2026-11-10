from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app import quotes
from app.routers import quotes as quotes_router

PRICES = {
    "BTC-USD": (73710.17, 75264.49),
    "EURUSD=X": (1.1168, 1.1226),
    "JPY=X": (158.79, 157.99),
    "USDCAD=X": (1.4184, 1.4119),
    "AVAX-USD": (30.0, 29.0),
    "ARB11841-USD": (0.5, 0.52),
}


@pytest.fixture
def yahoo(monkeypatch):
    # A fake Yahoo, so these tests never touch the network.
    state = {"calls": [], "down": set(), "now": datetime(2026, 11, 10, tzinfo=timezone.utc)}

    def fake_fetch(ticker):
        state["calls"].append(ticker)
        if "*" in state["down"] or ticker in state["down"]:
            raise ConnectionError("yahoo is down")
        if ticker not in PRICES and ticker.startswith("MISSING"):
            raise quotes.QuoteUnavailable(f"no price for {ticker}")
        return PRICES.get(ticker, (100.0, 99.0))

    monkeypatch.setattr(quotes, "_fetch_quote", fake_fetch)
    monkeypatch.setattr(quotes, "_now", lambda: state["now"])
    monkeypatch.setattr(quotes, "_cache", {})
    monkeypatch.setattr(quotes, "_unknown_until", {})
    return state


def status_of(call, *args):
    try:
        call(*args)
    except HTTPException as error:
        return error.status_code
    return 200


def test_crypto_quote_has_price_and_change(yahoo):
    result = quotes.crypto_quote("btc")
    assert result["symbol"] == "BTC"
    assert result["name"] == "Bitcoin"
    assert result["currency"] == "USD"
    assert result["price"] == 73710.17
    assert result["previous_close"] == 75264.49
    assert abs(result["change"] - (-1554.32)) < 0.01
    assert abs(result["change_percent"] - (-2.07)) < 0.01
    assert result["as_of"].startswith("2026-11-10")


def test_unknown_currencies_are_rejected(yahoo):
    with pytest.raises(quotes.UnknownSymbol):
        quotes.currency_quote("XXX")
    assert yahoo["calls"] == []  # nothing unsupported ever reaches Yahoo


def test_currency_quoted_in_dollars_per_unit_is_converted(yahoo):
    result = quotes.currency_quote("EUR")
    assert result["usd_per_unit"] == 1.1168
    assert abs(result["per_usd"] - 0.8954) < 0.0001
    assert result["change_percent"] < 0  # the euro lost value against the dollar


def test_currency_quoted_in_units_per_dollar_is_converted(yahoo):
    result = quotes.currency_quote("jpy")
    assert result["per_usd"] == 158.79
    assert abs(result["usd_per_unit"] - 0.006298) < 0.000001
    assert abs(result["change_percent"] - (-0.50)) < 0.01  # the yen weakened


def test_quotes_are_reused_for_a_minute(yahoo):
    quotes.crypto_quote("BTC")
    quotes.crypto_quote("BTC")
    assert yahoo["calls"] == ["BTC-USD"]
    yahoo["now"] += timedelta(seconds=61)
    quotes.crypto_quote("BTC")
    assert yahoo["calls"] == ["BTC-USD", "BTC-USD"]


def test_an_old_quote_stands_in_during_a_short_outage(yahoo):
    first = quotes.crypto_quote("BTC")
    yahoo["now"] += timedelta(minutes=5)
    yahoo["down"].add("*")
    assert quotes.crypto_quote("BTC")["price"] == first["price"]
    yahoo["now"] += timedelta(minutes=20)
    with pytest.raises(quotes.QuoteUnavailable):
        quotes.crypto_quote("BTC")


def test_an_outage_with_nothing_cached_is_reported(yahoo):
    yahoo["down"].add("*")
    with pytest.raises(quotes.QuoteUnavailable):
        quotes.currency_quote("EUR")


def test_the_list_skips_a_coin_yahoo_cannot_price(yahoo):
    yahoo["down"].add("ETH-USD")
    symbols = [coin["symbol"] for coin in quotes.all_crypto()]
    assert "BTC" in symbols
    assert "ETH" not in symbols
    assert symbols[0] == "BTC"  # the supported order is kept


def test_the_list_fails_when_nothing_can_be_priced(yahoo):
    yahoo["down"].add("*")
    with pytest.raises(quotes.QuoteUnavailable):
        quotes.all_currencies()


def test_currency_list_covers_the_settings_tab_currencies(yahoo):
    codes = [item["code"] for item in quotes.all_currencies()]
    for code in ["EUR", "GBP", "CAD", "JPY"]:
        assert code in codes


def test_endpoint_status_codes(yahoo):
    assert status_of(quotes_router.crypto, "BTC") == 200
    assert status_of(quotes_router.crypto, "MISSINGCOIN") == 404
    assert status_of(quotes_router.crypto, "A B") == 400
    assert status_of(quotes_router.currency, "EUR") == 200
    assert status_of(quotes_router.currency, "XXX") == 404
    assert status_of(quotes_router.crypto_list) == 200
    assert status_of(quotes_router.currency_list) == 200
    yahoo["now"] += timedelta(hours=1)
    yahoo["down"].add("*")
    assert status_of(quotes_router.crypto, "BTC") == 503
    assert status_of(quotes_router.currency_list) == 503


def test_a_coin_outside_the_list_can_be_looked_up(yahoo):
    result = quotes.crypto_quote("avax")
    assert result["symbol"] == "AVAX"
    assert result["name"] is None
    assert result["price"] == 30.0
    assert yahoo["calls"] == ["AVAX-USD"]


def test_a_full_yahoo_ticker_is_used_as_typed(yahoo):
    result = quotes.crypto_quote("arb11841-usd")
    assert result["symbol"] == "ARB11841"
    assert result["price"] == 0.5
    assert yahoo["calls"] == ["ARB11841-USD"]


def test_malformed_coin_symbols_never_reach_yahoo(yahoo):
    for bad in ["", "A B", "../x", "$BTC", "WAYTOOLONGCOINSYMBOL"]:
        with pytest.raises(quotes.InvalidSymbol):
            quotes.crypto_quote(bad)
    assert yahoo["calls"] == []


def test_a_missing_coin_is_not_found_and_remembered(yahoo):
    for _ in range(3):
        with pytest.raises(quotes.UnknownSymbol):
            quotes.crypto_quote("MISSINGCOIN")
    assert yahoo["calls"] == ["MISSINGCOIN-USD"]  # Yahoo was only asked once
    yahoo["now"] += timedelta(minutes=6)
    with pytest.raises(quotes.UnknownSymbol):
        quotes.crypto_quote("MISSINGCOIN")
    assert yahoo["calls"] == ["MISSINGCOIN-USD", "MISSINGCOIN-USD"]  # asked again later


def test_looked_up_coins_are_capped_but_the_list_is_not(yahoo, monkeypatch):
    monkeypatch.setattr(quotes, "MAX_EXTRA_QUOTES", 2)
    quotes.crypto_quote("BTC")
    for coin in ["AAA", "BBB", "CCC"]:
        yahoo["now"] += timedelta(seconds=1)
        quotes.crypto_quote(coin)
    extras = [ticker for ticker in quotes._cache if ticker not in quotes._SUPPORTED_TICKERS]
    assert len(extras) == 2
    assert "AAA-USD" not in quotes._cache  # the oldest lookup was dropped
    assert "BTC-USD" in quotes._cache


def test_a_listed_coin_typed_as_a_full_ticker_keeps_its_name(yahoo):
    result = quotes.crypto_quote("BTC-USD")
    assert result["symbol"] == "BTC"
    assert result["name"] == "Bitcoin"
