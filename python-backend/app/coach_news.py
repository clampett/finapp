"""Bounded public RSS fallback for Yahoo Finance's occasionally empty news API."""

from email.utils import parsedate_to_datetime
import urllib.request
import xml.etree.ElementTree as ET

RSS_URL = "https://feeds.finance.yahoo.com/rss/2.0/headline?s=SPY&region=US&lang=en-US"
MAX_BYTES = 512 * 1024


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Refused redirects so the fixed feed could never route a request to an arbitrary host.
        return None


def parse_news_feed(data):
    # Rejected oversized XML and entity declarations before parsing external provider data.
    if len(data) > MAX_BYTES or b"<!DOCTYPE" in data.upper() or b"<!ENTITY" in data.upper():
        return []
    try:
        root = ET.fromstring(data)
    except ET.ParseError:
        return []
    stories = []
    for item in root.findall("./channel/item")[:15]:
        try:
            published = parsedate_to_datetime(item.findtext("pubDate", ""))
        except (ValueError, TypeError):
            continue
        # Converted RSS into the same reviewed date, title and link contract as the primary feed.
        stories.append(
            {
                "content": {
                    "title": item.findtext("title", ""),
                    "pubDate": published.isoformat(),
                    "canonicalUrl": {"url": item.findtext("link", "")},
                    "summary": item.findtext("description", ""),
                    "provider": {"displayName": "Yahoo Finance RSS"},
                }
            }
        )
    return stories


def download_news_feed():
    # Fetched one fixed feed with a timeout, size limit and no credentials or user-entered query.
    request = urllib.request.Request(
        RSS_URL, headers={"User-Agent": "FinApp educational market briefing"}
    )
    with urllib.request.build_opener(_NoRedirect()).open(request, timeout=8) as response:
        data = response.read(MAX_BYTES + 1)
    return parse_news_feed(data)
