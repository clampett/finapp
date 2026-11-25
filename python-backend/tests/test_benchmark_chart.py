from datetime import datetime, timedelta, timezone
from concurrent.futures import ThreadPoolExecutor
import pandas as pd
import pytest
from fastapi import HTTPException
from app import benchmark_chart as chart


@pytest.fixture
def source(monkeypatch):
    state = {"calls": 0, "now": datetime(2026, 11, 12, tzinfo=timezone.utc), "fail": False}
    monkeypatch.setattr(chart, "_cache", {})
    monkeypatch.setattr(chart, "_attempts", {})
    monkeypatch.setattr(chart, "_now", lambda: state["now"])

    def prices(symbol, require_currency=True):
        state["calls"] += 1
        if state["fail"]:
            raise ConnectionError()
        return pd.Series(range(100, 1700), index=pd.bdate_range(end="2026-11-12", periods=1600))

    monkeypatch.setattr(chart, "get_prices", prices)
    return state


@pytest.mark.parametrize(
    "period,minimum,maximum", [("1mo", 19, 24), ("1y", 259, 263), ("5y", 1300, 1310)]
)
def test_calendar_ranges_used_real_cached_closes(source, period, minimum, maximum):
    result = chart.benchmark_chart("VOO", period)
    assert minimum <= len(result["points"]) <= maximum
    assert result["points"][-1]["date"] == "2026-11-12"
    assert result["interval"] == "1d" and result["adjusted"]
    assert source["calls"] == 1


@pytest.mark.parametrize("symbol,period", [("AAPL", "1mo"), ("VOO", "1h"), ("../secret", "1d")])
def test_unapproved_requests_never_called_the_provider(source, symbol, period):
    with pytest.raises(HTTPException) as error:
        chart.benchmark_chart(symbol, period)
    assert error.value.status_code == 400 and source["calls"] == 0


def test_parallel_range_requests_shared_one_refresh(source):
    with ThreadPoolExecutor(max_workers=6) as pool:
        values = list(pool.map(lambda _: chart.benchmark_chart("BND", "1y"), range(12)))
    assert source["calls"] == 1 and all(value["points"] for value in values)


def test_failed_intraday_fetch_was_backed_off_and_stale_data_expired(source, monkeypatch):
    calls = []

    def intraday(symbol):
        calls.append(symbol)
        if source["fail"]:
            raise ConnectionError()
        return pd.Series(
            [100.0, 101.0],
            index=pd.date_range("2026-11-12 14:30", periods=2, freq="5min", tz="UTC"),
        )

    monkeypatch.setattr(chart, "_intraday", intraday)
    first = chart.benchmark_chart("VOO", "1d")
    assert first["interval"] == "5m" and "+00:00" in first["points"][0]["date"]
    source["now"] += timedelta(minutes=6)
    source["fail"] = True
    assert chart.benchmark_chart("VOO", "1d")["stale"]
    chart.benchmark_chart("VOO", "1d")
    assert len(calls) == 2
    source["now"] += timedelta(days=2)
    with pytest.raises(HTTPException):
        chart.benchmark_chart("VOO", "1d")


def test_latest_session_was_selected_in_exchange_timezone(monkeypatch):
    import yfinance

    frame = pd.DataFrame(
        {"Close": [100.0, 101.0, 102.0]},
        index=pd.DatetimeIndex(
            ["2026-11-11 20:55:00+00:00", "2026-11-12 14:30:00+00:00", "2026-11-12 14:35:00+00:00"]
        ),
    )

    class Ticker:
        def history(self, **options):
            assert options["interval"] == "5m" and options["prepost"] is False
            return frame

    monkeypatch.setattr(yfinance, "Ticker", lambda symbol: Ticker())
    assert chart._intraday("VOO").tolist() == [101.0, 102.0]


def test_stock_ranges_verified_usd_before_loading_chart_history(source, monkeypatch):
    from app import stocks

    verified = []
    monkeypatch.setattr(
        stocks, "lookup_stock", lambda symbol: verified.append(symbol) or {"currency": "USD"}
    )
    result = chart.stock_chart("googl", "5y")
    assert verified == ["GOOGL"] and result["symbol"] == "GOOGL"
    assert len(result["points"]) > 1200


def test_unknown_or_non_usd_stocks_never_reached_intraday_provider(source, monkeypatch):
    from app import stocks
    from app.price_cache import UnsupportedCurrency

    called = []
    monkeypatch.setattr(chart, "_intraday", lambda symbol: called.append(symbol))
    for failure in [stocks.SymbolNotFound("Unknown symbol"), UnsupportedCurrency("Not USD")]:

        def reject(symbol):
            raise failure

        monkeypatch.setattr(stocks, "lookup_stock", reject)
        with pytest.raises(type(failure)):
            chart.stock_chart("AAPL", "1d")
    assert called == []


def test_invalid_stock_periods_and_symbols_never_triggered_lookup(source, monkeypatch):
    from app import stocks

    verified = []
    monkeypatch.setattr(stocks, "lookup_stock", lambda symbol: verified.append(symbol))
    with pytest.raises(HTTPException):
        chart.stock_chart("AAPL", "12h")
    with pytest.raises(stocks.InvalidSymbol):
        chart.stock_chart("https://example.com", "1d")
    assert verified == []


def test_chart_caches_remained_bounded_when_new_holdings_were_loaded(source, monkeypatch):
    from app import stocks

    monkeypatch.setattr(stocks, "lookup_stock", lambda symbol: {"currency": "USD"})
    for index in range(256):
        chart._cache[(str(index), "1y")] = (source["now"], {})
        chart._attempts[(str(index), "1y")] = source["now"]
    chart.stock_chart("GOOGL", "1y")
    assert len(chart._cache) == 256 and len(chart._attempts) == 256
