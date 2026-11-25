// Retrieved a fixed public briefing and shared its refresh across concurrent chat requests.
function createCoachMarket({
  request = fetch,
  upstream = 'http://127.0.0.1:8081',
  now = Date.now,
} = {}) {
  const origin = new URL(upstream);
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  ) {
    throw new Error('The coach upstream must be a configured HTTP server origin.');
  }
  let cached;
  let retryAt = 0;
  let pending;
  function snapshot(stale = false) {
    // Expired observations after one day and headlines after seven days, even during an outage.
    if (
      !cached ||
      !Number.isFinite(Date.parse(cached.fetched_at)) ||
      now() - Date.parse(cached.fetched_at) > 86400000
    )
      return null;
    return {
      ...cached,
      status: stale ? 'stale' : cached.status,
      news: cached.news.filter((item) => now() - Date.parse(item.published_at) <= 604800000),
    };
  }
  async function get() {
    if (now() < retryAt) return snapshot();
    if (pending) return pending;
    pending = (async () => {
      try {
        const response = await request(new URL('/api/v1/market/context', origin), {
          signal: AbortSignal.timeout(3000),
          redirect: 'error',
        });
        if (!response.ok) throw new Error('Briefing unavailable');
        const body = await response.json();
        // Accepted only a bounded snapshot from the configured FinApp market service.
        if (
          !['ready', 'stale', 'pending', 'unavailable'].includes(body.status) ||
          !Array.isArray(body.markets) ||
          !Array.isArray(body.news)
        )
          throw new Error('Invalid briefing');
        cached = {
          status: body.status,
          fetched_at: body.fetched_at,
          markets: body.markets.slice(0, 4),
          news: body.news
            .filter((item) => {
              try {
                const url = new URL(item.url);
                const age = now() - Date.parse(item.published_at);
                return (
                  url.protocol === 'https:' &&
                  ['finance.yahoo.com', 'www.finance.yahoo.com'].includes(url.hostname) &&
                  !url.username &&
                  !url.password &&
                  (!url.port || url.port === '443') &&
                  typeof item.title === 'string' &&
                  Number.isFinite(age) &&
                  age >= -300000 &&
                  age <= 604800000
                );
              } catch {
                return false;
              }
            })
            .slice(0, 6),
        };
        retryAt = now() + (body.pending ? 3000 : 30000);
        return snapshot() ?? { status: body.status, markets: [], news: [], fetched_at: null };
      } catch {
        // Used a clearly dated stale snapshot during a short interruption and backed off failed fetches.
        if (cached) cached = { ...cached, status: 'stale' };
        retryAt = now() + 30000;
        return snapshot(true);
      } finally {
        pending = undefined;
      }
    })();
    return pending;
  }
  return { get };
}
module.exports = { createCoachMarket };
