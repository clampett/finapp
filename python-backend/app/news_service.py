"""Shared background news refreshes and retained explicitly dated partial results."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from threading import Lock, Thread
import time
from app.news_sources import SOURCES, MAX_AGE, download, parse_feed


class NewsService:
    def __init__(self, fetch=download, clock=time.time):
        self.fetch, self.clock = fetch, clock
        self.lock = Lock()
        self.pending = False
        self.retry_at = 0
        self.cache = {}
        self.health = {}

    def refresh(self):
        try:
            # Fetched each publisher independently so one outage could not erase the other feeds.
            def load(source):
                return parse_feed(self.fetch(source), source, self.clock())

            with ThreadPoolExecutor(max_workers=4) as pool:
                jobs = [(source, pool.submit(load, source)) for source in SOURCES]
                for source, future in jobs:
                    try:
                        stories = future.result()
                        with self.lock:
                            self.cache[source["id"]] = (self.clock(), stories)
                            self.health[source["id"]] = "ready"
                    except Exception:
                        with self.lock:
                            self.health[source["id"]] = "unavailable"
        finally:
            with self.lock:
                now = self.clock()
                has_stories = any(
                    stories
                    for ts, stories in self.cache.values()
                    if now - ts <= 86400 and stories
                )
                # Applied a five-minute shared cooldown when cache has valid stories;
                # on total failure or empty cache, retry in 10s so outages recover quickly.
                self.retry_at = now + (300 if has_stories else 10)
                self.pending = False

    def get(self):
        with self.lock:
            now = self.clock()
            if not self.pending and now >= self.retry_at:
                self.pending = True
                Thread(target=self.refresh, daemon=True, name="finapp-news").start()
            sources, articles, dates = [], [], []
            for source in SOURCES:
                saved = self.cache.get(source["id"])
                # Expired cached snapshots after 24 hours and old headlines after seven days.
                valid = saved is not None and now - saved[0] <= 86400
                if valid:
                    dates.append(saved[0])
                    articles.extend(
                        item
                        for item in saved[1]
                        if now - datetime.fromisoformat(item["published_at"]).timestamp() <= MAX_AGE
                    )
                sources.append(
                    {
                        "id": source["id"],
                        "name": source["name"],
                        "status": self.health.get(source["id"], "pending"),
                        "updated_at": (
                            datetime.fromtimestamp(saved[0], timezone.utc).isoformat()
                            if valid
                            else None
                        ),
                    }
                )
            # Deduplicated canonical links and normalized headlines across publishers.
            seen, unique = set(), []
            for item in sorted(articles, key=lambda story: story["published_at"], reverse=True):
                key = item["title"].casefold().strip()
                if key not in seen and item["id"] not in seen:
                    seen.update((key, item["id"]))
                    unique.append(item)
            return {
                "status": (
                    "pending"
                    if not unique and self.pending
                    else (
                        "unavailable"
                        if not unique
                        else "partial" if any(s["status"] != "ready" for s in sources) else "ready"
                    )
                ),
                "pending": self.pending,
                "articles": unique[:160],
                "sources": sources,
                "fetched_at": (
                    datetime.fromtimestamp(max(dates), timezone.utc).isoformat() if dates else None
                ),
                "refresh_after_seconds": max(3 if self.pending else 0, int(self.retry_at - now)),
            }


news = NewsService()
