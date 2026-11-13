from datetime import datetime, timedelta, timezone
from concurrent.futures import Future, ThreadPoolExecutor
from types import SimpleNamespace
import pytest
from app import coach_market as market

NOW = datetime(2026, 11, 12, 15, tzinfo=timezone.utc)


def story(
    url="https://finance.yahoo.com/news/example.html", age=1, title="<b>Markets</b> &amp; rates"
):
    return {
        "content": {
            "title": title,
            "pubDate": (NOW - timedelta(days=age)).isoformat(),
            "canonicalUrl": {"url": url},
            "provider": {"displayName": "Provider"},
            "summary": "<p>Public report.</p>",
        }
    }


@pytest.fixture
def isolated(monkeypatch):
    # Replaced the background executor so unit tests could never call a live provider.
    calls = []
    future = Future()
    monkeypatch.setattr(
        market, "_pool", SimpleNamespace(submit=lambda task: calls.append(task) or future)
    )
    monkeypatch.setattr(market, "_snapshot", None)
    monkeypatch.setattr(market, "_job", None)
    monkeypatch.setattr(market, "_attempted_at", None)
    monkeypatch.setattr(market, "_now", lambda: NOW)
    return calls, future


def test_news_removed_markup_and_rejected_unsafe_undated_old_and_future_stories():
    items = [
        story(),
        story(),
        story("https://evil.example/story"),
        story(age=8),
        story(age=-1),
        story("https://user:secret@finance.yahoo.com/news/x"),
        story("https://finance.yahoo.com:bad/x"),
        {"content": {"title": "Undated"}},
        {"content": "bad"},
        None,
    ]
    result = market.clean_news(items, NOW)
    assert len(result) == 1
    assert result[0]["title"] == "Markets & rates"
    assert result[0]["summary"] == "Public report."
    assert market.clean_news(None, NOW) == []


@pytest.mark.parametrize(
    "url",
    [
        "http://finance.yahoo.com/x",
        "https://finance.yahoo.com.evil/x",
        "javascript:alert(1)",
        "https://finance.yahoo.com:8443/x",
    ],
)
def test_only_verified_https_article_hosts_were_allowed(url):
    assert market.safe_news_url(url) is None


def test_parallel_requests_started_only_one_background_refresh(isolated):
    calls, _ = isolated
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: market.market_context(), range(24)))
    assert len(calls) == 1
    assert all(result["pending"] for result in results)
    assert all(result["markets"] == [] for result in results)


def test_failed_refresh_was_backed_off(isolated):
    calls, future = isolated
    market.market_context()
    future.set_result(None)
    assert market.market_context()["status"] == "unavailable"
    assert len(calls) == 1


def test_stale_quotes_were_dated_and_expired_news_were_removed(isolated, monkeypatch):
    monkeypatch.setattr(
        market,
        "_snapshot",
        {
            "fetched_at": (NOW - timedelta(hours=2)).isoformat(),
            "markets": [{"symbol": "VOO"}],
            "news": [{"published_at": (NOW - timedelta(days=8)).isoformat()}],
            "missing": [],
        },
    )
    result = market.market_context()
    assert result["status"] == "stale" and result["pending"]
    assert result["markets"][0]["symbol"] == "VOO" and not result["news"]
    monkeypatch.setattr(
        market,
        "_snapshot",
        {**market._snapshot, "fetched_at": (NOW - timedelta(days=2)).isoformat()},
    )
    assert market.market_context()["markets"] == []


def test_refresh_used_four_fixed_cached_quotes_and_one_news_request(isolated, monkeypatch):
    symbols = []

    def quote(symbol):
        symbols.append(symbol)
        return {
            "history": [{"close": 100 + i} for i in range(21)],
            "latest_price": 120,
            "latest_date": "2026-11-11",
            "annual_volatility": 0.2,
        }

    monkeypatch.setattr(market, "lookup_stock", quote)
    monkeypatch.setattr(market, "_download_news", lambda: [story()])
    market._refresh()
    result = market.market_context()
    assert result["status"] == "ready" and len(result["news"]) == 1
    assert symbols == list(market.BENCHMARKS)
    assert result["markets"][0]["change_percent"] == pytest.approx(20)


def test_empty_primary_feed_used_the_fixed_rss_fallback(isolated, monkeypatch):
    monkeypatch.setattr(
        market, "lookup_stock", lambda symbol: (_ for _ in ()).throw(ConnectionError())
    )
    monkeypatch.setattr(market, "_download_news", lambda: [])
    monkeypatch.setattr(market, "download_news_feed", lambda: [story()])
    market._refresh()
    assert len(market.market_context()["news"]) == 1


def test_rss_rejected_entity_expansion_and_parsed_only_bounded_articles():
    from app.coach_news import parse_news_feed, MAX_BYTES

    xml = b"<rss><channel><item><title>A story</title><link>https://finance.yahoo.com/news/a</link><pubDate>Thu, 12 Nov 2026 11:04:13 +0000</pubDate></item></channel></rss>"
    assert len(market.clean_news(parse_news_feed(xml), NOW)) == 1
    assert parse_news_feed(b'<!DOCTYPE rss [<!ENTITY x "unsafe">]><rss/>') == []
    assert parse_news_feed(b"x" * (MAX_BYTES + 1)) == []
    assert parse_news_feed(b"<broken") == []
