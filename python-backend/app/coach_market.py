"""Cached public market context for the scenario coach, without API credentials."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from html import unescape
import re
import threading
from urllib.parse import urlsplit

from app.stocks import lookup_stock
from app.coach_news import download_news_feed

BENCHMARKS = {
    "VOO": "U.S. stocks",
    "BND": "U.S. bonds",
    "VXUS": "International stocks",
    "VNQ": "Real estate",
}
TTL = timedelta(minutes=15)
STALE_LIMIT = timedelta(hours=24)
RETRY_DELAY = timedelta(minutes=2)
_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="finapp-briefing")
_lock = threading.Lock()
_snapshot = None
_job = None
_attempted_at = None


def _now():
    return datetime.now(timezone.utc)


def _text(value, limit):
    # Removed markup and control characters before provider text reached the chat prompt.
    if not isinstance(value, str):
        return ""
    return re.sub(r"\s+", " ", re.sub(r"<[^>]*>|[\x00-\x1f\x7f]", " ", unescape(value))).strip()[
        :limit
    ]


def safe_news_url(value):
    # Allowed only public Yahoo article links and never fetched URLs supplied by a user or headline.
    if not isinstance(value, str) or len(value) > 1500:
        return None
    url = urlsplit(value)
    if (
        url.scheme != "https"
        or url.hostname not in {"finance.yahoo.com", "www.finance.yahoo.com"}
        or url.username
        or url.password
        or url.port not in {None, 443}
    ):
        return None
    return value


def clean_news(items, now):
    result = []
    seen = set()
    for item in (items if isinstance(items, list) else [])[:15]:
        content = item.get("content", {}) if isinstance(item, dict) else {}
        if not isinstance(content, dict):
            continue
        try:
            published = datetime.fromisoformat(content.get("pubDate", "").replace("Z", "+00:00"))
            url = safe_news_url((content.get("canonicalUrl") or {}).get("url"))
        except (ValueError, TypeError, AttributeError):
            continue
        title = _text(content.get("title"), 180)
        # Excluded undated, future, old, and duplicate stories from the recent-events briefing.
        if (
            not title
            or not url
            or url in seen
            or published.tzinfo is None
            or now - published > timedelta(days=7)
            or published - now > timedelta(minutes=5)
        ):
            continue
        provider = content.get("provider") or {}
        result.append(
            dict(
                title=title,
                url=url,
                published_at=published.isoformat(),
                publisher=(
                    _text(provider.get("displayName"), 80) if isinstance(provider, dict) else ""
                ),
                summary=_text(content.get("summary"), 350),
            )
        )
        seen.add(url)
    return sorted(result, key=lambda article: article["published_at"], reverse=True)[:6]


def _download_news():
    import yfinance as yf

    # Requested one broad-market feed per refresh rather than searching Yahoo on every chat message.
    return yf.Ticker("SPY").get_news(count=12)


def _refresh():
    global _snapshot
    now = _now()
    markets = []
    errors = []
    for symbol, name in BENCHMARKS.items():
        try:
            quote = lookup_stock(symbol)
            history = quote["history"][-21:]
            closes = [point["close"] for point in history]
            markets.append(
                dict(
                    symbol=symbol,
                    name=name,
                    price=quote["latest_price"],
                    date=quote["latest_date"],
                    closes=closes,
                    change_percent=(
                        ((closes[-1] / closes[0] - 1) * 100) if len(closes) == 21 else None
                    ),
                    volatility=quote.get("annual_volatility"),
                    history_start=quote.get("stats_start_date"),
                    history_end=quote.get("stats_end_date"),
                )
            )
        except Exception:
            errors.append(symbol)
    try:
        news = clean_news(_download_news(), now)
    except Exception:
        news = []
    if not news:
        try:
            # Reused the same sanitizer for a fixed free RSS feed when the primary API was empty.
            news = clean_news(download_news_feed(), now)
        except Exception:
            news = []
    if not news:
        errors.append("news")
    if not markets and not news:
        return
    # Stored one complete snapshot so concurrent readers never observed a partially refreshed list.
    with _lock:
        _snapshot = dict(markets=markets, news=news, fetched_at=_now().isoformat(), missing=errors)


def market_context():
    global _job, _attempted_at
    now = _now()
    with _lock:
        snapshot = _snapshot
        age = now - datetime.fromisoformat(snapshot["fetched_at"]) if snapshot else None
        expired = snapshot is None or age >= TTL
        can_retry = _attempted_at is None or now - _attempted_at >= RETRY_DELAY
        if expired and can_retry and (_job is None or _job.done()):
            _attempted_at = now
            # Refreshed in one bounded background worker while API requests returned cached data immediately.
            _job = _pool.submit(_refresh)
        pending = _job is not None and not _job.done()
        if snapshot is None or age > STALE_LIMIT:
            return dict(
                status="pending" if pending else "unavailable",
                pending=pending,
                markets=[],
                news=[],
                fetched_at=None,
                missing=[],
            )
        # Rechecked headline age while serving stale snapshots so old news was never labeled recent.
        news = [
            item
            for item in snapshot["news"]
            if now - datetime.fromisoformat(item["published_at"]) <= timedelta(days=7)
        ]
        return dict(snapshot, news=news, status="stale" if age >= TTL else "ready", pending=pending)
