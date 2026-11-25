"""Normalized fixed publisher feeds without accepting browser-controlled URLs."""

from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from hashlib import sha256
from html import unescape
import re
import urllib.request
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
import xml.etree.ElementTree as ET

MAX_BYTES = 512 * 1024
MAX_AGE = 7 * 86400
SOURCES = (
    {
        "id": "yahoo",
        "name": "Yahoo Finance",
        "url": "https://feeds.finance.yahoo.com/rss/2.0/headline?s=SPY&region=US&lang=en-US",
        "hosts": ("finance.yahoo.com", "www.finance.yahoo.com"),
    },
    {
        "id": "cnbc",
        "name": "CNBC",
        "url": "https://www.cnbc.com/id/100003114/device/rss/rss.html",
        "hosts": ("www.cnbc.com", "cnbc.com"),
    },
    {
        "id": "bbc",
        "name": "BBC Business",
        "url": "https://feeds.bbci.co.uk/news/business/rss.xml",
        "hosts": ("www.bbc.com", "www.bbc.co.uk", "bbc.com", "bbc.co.uk"),
    },
    {
        "id": "fed",
        "name": "Federal Reserve",
        "url": "https://www.federalreserve.gov/feeds/press_all.xml",
        "hosts": ("www.federalreserve.gov", "federalreserve.gov"),
    },
)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Refused redirects rather than letting a publisher request reach an arbitrary destination.
        return None


def text(value, limit):
    # Removed markup and control characters; only plain publisher text was displayed.
    value = re.sub(r"<[^>]*>", " ", unescape(value or ""))
    return re.sub(r"\s+", " ", re.sub(r"[\x00-\x1f\x7f]", " ", value)).strip()[:limit]


def article_url(value, source):
    try:
        url = urlsplit(value)
        if (
            url.scheme != "https"
            or url.hostname not in source["hosts"]
            or url.username
            or url.password
            or url.port not in (None, 443)
        ):
            return None
        # Removed known tracking parameters before assigning stable bookmark identities.
        query = [
            (key, val)
            for key, val in parse_qsl(url.query)
            if not key.lower().startswith("utm_")
            and key.lower() not in ("guccounter", "guce_referrer", "guce_referrer_sig")
        ]
        return urlunsplit(("https", url.hostname, url.path, urlencode(query), ""))[:2000]
    except (ValueError, TypeError):
        return None


def topic(title, source):
    # Assigned transparent keyword categories without fabricating market sentiment or predictions.
    if source["id"] == "fed" or re.search(
        r"\b(inflation|economy|economic|interest rate|federal reserve|tariff|jobs|gdp|bank)\b",
        title,
        re.I,
    ):
        return "economy"
    if re.search(r"\b(retirement|mortgage|saving|pension|tax|credit card|consumer)\b", title, re.I):
        return "personal-finance"
    if re.search(r"\b(ai|tech|technology|chip|nvidia|apple|microsoft)\b", title, re.I):
        return "technology"
    return "markets"


def parse_feed(data, source, now):
    # Rejected entity declarations and oversized XML before parsing public RSS.
    if len(data) > MAX_BYTES or b"<!DOCTYPE" in data.upper() or b"<!ENTITY" in data.upper():
        raise ValueError("Unsupported feed")
    root = ET.fromstring(data)
    stories = []
    for item in root.findall("./channel/item")[:60]:
        try:
            date = parsedate_to_datetime(item.findtext("pubDate", ""))
            if date.tzinfo is None:
                date = date.replace(tzinfo=timezone.utc)
            age = now - date.timestamp()
            title = text(item.findtext("title"), 240)
            url = article_url(item.findtext("link", ""), source)
            if not title or not url or not -300 <= age <= MAX_AGE:
                continue
            stories.append(
                {
                    "id": sha256(url.encode()).hexdigest()[:24],
                    "title": title,
                    "url": url,
                    "published_at": date.astimezone(timezone.utc).isoformat(),
                    "source_id": source["id"],
                    "source": source["name"],
                    "topic": topic(title, source),
                }
            )
        except (ValueError, TypeError, OverflowError):
            continue
    return stories


def download(source):
    # Requested fixed RSS endpoints with bounded time, response size, and no user credentials.
    req = urllib.request.Request(
        source["url"],
        headers={
            "User-Agent": "FinApp/1.0 public financial news reader",
            "Accept": "application/rss+xml, application/xml, text/xml",
        },
    )
    with urllib.request.build_opener(NoRedirect()).open(req, timeout=6) as response:
        return response.read(MAX_BYTES + 1)
