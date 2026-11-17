from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
import threading
import time
import pytest
from app.news_sources import SOURCES, MAX_BYTES, article_url, parse_feed
from app.news_service import NewsService

NOW = datetime(2026, 11, 16, 17, tzinfo=timezone.utc)


def feed(source=SOURCES[0], title="Markets &amp; rates", days=0, url=None):
    date = format_datetime(NOW - timedelta(days=days))
    url = url or f'https://{source["hosts"][0]}/news/fixture'
    return f"<rss><channel><item><title>{title}</title><link>{url}</link><pubDate>{date}</pubDate></item></channel></rss>".encode()


def test_feed_normalization_kept_dates_sources_topics_and_plain_headlines():
    items = parse_feed(
        feed(title="&lt;b&gt;Inflation&lt;/b&gt; &amp; rates"), SOURCES[0], NOW.timestamp()
    )
    assert len(items) == 1
    assert items[0]["title"] == "Inflation & rates"
    assert items[0]["source"] == "Yahoo Finance"
    assert items[0]["topic"] == "economy"
    assert items[0]["published_at"] == NOW.isoformat()
    assert len(items[0]["id"]) == 24


@pytest.mark.parametrize(
    "url",
    [
        "javascript:alert(1)",
        "http://finance.yahoo.com/a",
        "https://finance.yahoo.com.evil.example/a",
        "https://user:pass@finance.yahoo.com/a",
        "https://finance.yahoo.com:8000/a",
    ],
)
def test_article_links_rejected_unsafe_destinations(url):
    assert article_url(url, SOURCES[0]) is None


def test_stable_article_identity_removed_tracking_parameters():
    assert (
        article_url("https://finance.yahoo.com/a?utm_source=feed#top", SOURCES[0])
        == "https://finance.yahoo.com/a"
    )
    assert not parse_feed(feed(days=8), SOURCES[0], NOW.timestamp())
    assert not parse_feed(feed(days=-1), SOURCES[0], NOW.timestamp())


def test_feed_rejected_entities_and_large_documents():
    for content in [b'<!DOCTYPE rss [<!ENTITY x "value">]><rss/>', b"x" * (MAX_BYTES + 1)]:
        with pytest.raises(ValueError):
            parse_feed(content, SOURCES[0], NOW.timestamp())


def test_partial_outage_preserved_successful_feeds_and_applied_shared_cooldown():
    clock = [NOW.timestamp()]
    calls = []

    def fetch(source):
        calls.append(source["id"])
        if source["id"] == "cnbc":
            raise OSError("offline")
        return feed(source, title=source["name"])

    service = NewsService(fetch, lambda: clock[0])
    service.refresh()
    first = service.get()
    assert first["status"] == "partial"
    assert len(first["articles"]) == 3
    assert len(calls) == 4
    service.get()
    assert len(calls) == 4
    assert first["refresh_after_seconds"] == 300
    # Expired old cached data without calling a live publisher during the test.
    clock[0] += 86401
    service.retry_at = clock[0] + 300
    assert service.get()["articles"] == []


def test_concurrent_readers_shared_one_nonblocking_background_refresh():
    release = threading.Event()
    calls = []

    def fetch(source):
        calls.append(source["id"])
        release.wait(2)
        return feed(source, title=source["name"])

    service = NewsService(fetch, lambda: NOW.timestamp())
    try:
        for _ in range(20):
            assert service.get()["pending"]
        deadline = time.monotonic() + 1
        while len(calls) < 4 and time.monotonic() < deadline:
            time.sleep(0.005)
        assert len(calls) == 4
    finally:
        release.set()
    deadline = time.monotonic() + 2
    while service.pending and time.monotonic() < deadline:
        time.sleep(0.005)
    assert service.get()["status"] == "ready"


def test_duplicate_headlines_from_different_publishers_were_collapsed():
    service = NewsService(lambda source: feed(source), lambda: NOW.timestamp())
    service.refresh()
    assert len(service.get()["articles"]) == 1


def test_total_outage_retries_quickly_without_five_minute_lockout():
    clock = [NOW.timestamp()]
    calls = []

    def failing_fetch(source):
        calls.append(source["id"])
        raise OSError("network down")

    service = NewsService(failing_fetch, lambda: clock[0])
    service.refresh()
    result = service.get()
    assert result["status"] == "unavailable"
    assert result["articles"] == []
    assert len(calls) == 4
    # On total failure or empty cache, cooldown is 10s, never a 5-minute lockout.
    assert result["refresh_after_seconds"] <= 10
    # Next get within 10s does not refetch yet.
    service.get()
    assert len(calls) == 4
    # Advancing by 11 seconds triggers a new refresh attempt.
    clock[0] += 11
    retrying = service.get()
    assert retrying["pending"] is True
    # Wait for the background refresh thread to complete.
    deadline = time.monotonic() + 2
    while service.pending and time.monotonic() < deadline:
        time.sleep(0.005)
    assert len(calls) == 8
