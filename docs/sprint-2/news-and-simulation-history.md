# Financial news and saved simulation runs

Updated: 11/16/2026. User stories 23 and 26.

## User journeys

**News:** Open Financial news, choose a topic/publisher or search, then open a headline at its original publisher. The reading list saves public article metadata in browser storage, scoped to the signed-in account or selected demo profile. Full articles and images are not copied into FinApp.

**History:** Run Monte Carlo or Markov in Node Graph, wait for completion, and choose Save run. Simulation history lists the saved date, model, horizon, and ending percentiles. Open a run to inspect the original chart, input assumptions, model context, and included balances. Two runs with matching horizons and inflation rates can be compared. Renaming changes only the title. Deletion requires confirmation in the UI. Export downloads the snapshot as JSON.

Saving is deliberate, not automatic on every slider preview. AI Coach's temporary comparison notebook remains separate. Saved results are never recalculated against today's market data when opened.

## Source map

| Area                                                              | Location                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------- |
| News desk UI, filters, reading list, publisher checks             | `frontend/dashboard/src/news/`                          |
| Saved-run adapters, controls, history cards, details, comparisons | `frontend/dashboard/src/history/`                       |
| Shared line icons                                                 | `frontend/dashboard/src/common/FeatureIcon.tsx`         |
| Fixed RSS definitions and normalization                           | `python-backend/app/news_sources.py`                    |
| Background cache and source health                                | `python-backend/app/news_service.py`                    |
| News HTTP route                                                   | `python-backend/app/routers/news.py`                    |
| News forwarding                                                   | Java `MarketController.news()`                          |
| Account-scoped history API                                        | Java `SimulationRunController` / `SimulationRunService` |
| Durable storage                                                   | `V10__Saved_simulation_runs.sql`                        |

## Public feed contracts

- [Yahoo Finance](https://feeds.finance.yahoo.com/rss/2.0/headline?s=SPY&region=US&lang=en-US)
- [CNBC](https://www.cnbc.com/id/100003114/device/rss/rss.html)
- [BBC Business](https://feeds.bbci.co.uk/news/business/rss.xml)
- [Federal Reserve press releases](https://www.federalreserve.gov/feeds/press_all.xml)

`GET /api/v1/market/news` is public and forwards to Python `GET /api/news`. It returns articles, publisher health, the last successful refresh time, and pending/partial status. Category labels come from headline keywords; they are not sentiment predictions. Source feeds may be delayed, incomplete, or unavailable, and publishers may require subscriptions.

One shared refresh downloads fixed feeds concurrently, at most once per five minutes per process. Each fetch has a six-second timeout and a 512 KB response limit. Redirects, XML entity/DOCTYPE declarations, non-HTTPS article links, unexpected destination hosts, future timestamps, and headlines older than seven days are rejected. HTML is removed and only headlines, links, dates, and attribution are retained. Cached publisher data expires after 24 hours; outages are reported without inventing headlines.

## Private history contracts

All `/api/v1/simulation-runs` operations require the existing cookie plus matching tab session header. Ownership comes from the validated principal; client-supplied user IDs cannot select another account.

| Method | Route                             | Behavior                                                                |
| ------ | --------------------------------- | ----------------------------------------------------------------------- |
| GET    | `/simulation-runs?page=0&size=12` | Paginated summaries; maximum page size 25.                              |
| POST   | `/simulation-runs`                | Save title, model kind, original input JSON, and completed result JSON. |
| GET    | `/simulation-runs/{id}`           | Read one owner's immutable snapshot.                                    |
| PATCH  | `/simulation-runs/{id}`           | Rename only.                                                            |
| DELETE | `/simulation-runs/{id}`           | Remove only the owner's record.                                         |

Signed-in accounts retain up to 100 runs. The save transaction locks the owner row before checking the quota. Inputs are limited to 256 KB and results to 512 KB. Only completed model-version-3 Monte Carlo/Markov results with matching inputs, complete sequential yearly points, and finite ordered percentiles are accepted. SQL values are parameterized. Every read/update/delete includes the owner predicate. Account deletion cascades to its runs. Versioned snapshots use the new `simulation_run_snapshots` table; the earlier `simulation_runs` table and any legacy records are preserved unchanged.

Demo profiles use a separate browser-only adapter capped at 20 runs, with explicit storage/quota errors. Private API failures never fall back to demo history. Demo rows and reading-list entries are validated before use. Reaching either quota does not silently discard earlier records.

## Verification

From the repository root:

```bash
npm test --prefix frontend
npm run build --prefix frontend/dashboard
npm run lint --prefix frontend/dashboard
npm run format:check --prefix frontend
```

From `python-backend`:

```bash
python -m pytest tests/test_news.py
```

From `java-backend` on Windows:

```powershell
.\mvnw.cmd "-Dtest=SimulationRunServiceTest,SimulationRunSecurityTest,MarketControllerTest" test
```

Automated checks cover the actual migration, ownership, authentication, quota enforcement, SQL-injection-like title input, malformed/oversized results, cache expiry, shared refreshes, partial publisher failures, unsafe links, demo persistence, immutable inputs, browser storage errors, and private-session failures. Browser smoke checks also cover reading-list/filter controls, themes, mobile overflow, saving completed simulations, reload persistence, and reopening charts. Test fixtures are explicitly hypothetical; no fixture headlines are shown to production users.
