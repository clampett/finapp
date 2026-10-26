# Simulation math and demo checks

The updated dashboard keeps the existing Python repayment engine, Markov class, and price cache. The active household model has been corrected and extended. Existing comments have been preserved; new comments describe the important calculation order.

## Monthly reconciliation

For gross pay:

```text
estimated tax = gross monthly income × selected effective tax rate
take-home pay = gross income − estimated tax
after-bill surplus = take-home pay − living expenses − actual contractual loan payments
```

For income already entered as take-home pay, no additional tax is deducted. The effective rate is an estimate, not a tax-bracket, filing-status, payroll-tax, or state-tax calculation. New scenarios default to gross pay and a visible, editable 20% estimate.

The seeded examples reconcile as follows, before extra investment allocation:

| Demo | Gross monthly pay | Estimated tax | Living expenses | Loan payments | After bills | Planned investments | Planned savings | Still unassigned |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Recent Grad | $4,583.33 | $916.67 | $1,400.00 | $450.00 | $1,816.66 | $200.00 | $0.00 | $1,616.66 |
| Mid-Career Family | $11,250.00 | $2,250.00 | $4,600.00 | $450.00 | $3,950.00 | $1,100.00 | $300.00 | $2,550.00 |
| FIRE Strategist | $8,166.67 | $1,633.33 | $2,200.00 | $0.00 | $4,333.34 | $3,033.34 | $216.67 | $1,083.33 |

Calculations retain precision internally; displayed currency is rounded to cents. Percentage-based displayed parts can therefore differ by a cent when summed after rounding.

## Saving and investment transfers

Transfers from income/checking into investment or savings accounts are funded from positive after-bill surplus:

1. Fixed transfers are funded first. If their total exceeds the available money, they are reduced proportionally.
2. Percentage routes use the amount left after fixed transfers. Combined percentages above 100% are scaled proportionally and flagged.
3. The extra-investment slider applies only to still-unassigned money. Everything else stays in checking; scheduled savings go to the savings pool.

At 0% extra investing, the Recent Grad still invests the planned $200 and keeps the remaining $1,616.66 in checking. At 100%, the initial investment contribution is $1,816.66. Neither transfer is deducted from net worth as a living expense. Income-to-checking routes are not counted as extra income, and existing balances are never treated as monthly cash flows.

To model **$0 in new investments**, turn off **Include scheduled investment transfers** and set the extra-investment slider to 0%. This experiment omits investment-destination routes from the simulation request while preserving the saved node graph, existing investment balances, and savings routes. Available money stays in cash. A zero contribution does not force net worth downward: a decline requires market losses, purchasing-power erosion, or a budget shortfall. Negative forward-return assumptions can be used to explore a sustained downturn.

While assumptions are changed, the screen retains its last completed charts, results, and open audit table. Requests are debounced and superseded requests are aborted; an updating indicator distinguishes the previous result from the pending calculation. The chart and outcome sections are memoized so dragging the slider does not repeatedly redraw unchanged charts. Detailed user guides for each simulation appear below the left-column results.

The browser implementation in `frontend/dashboard/src/finance.ts` and the Python implementation in `python-backend/app/cashflow.py` share this order and are tested against the same SQL demo fixtures. Gross/net, tax, and growth settings are retained in scenario JSON and browser drafts.

## Loans, asset balances, and negative results

The node editor now uses incoming expense routes from income/checking as the expense plan, replacing the expense node's default amount. Multiple routes are added, and percentage expense routes use starting household take-home income. Debt payment routes also accept percentages of starting take-home income, with explicit node payment overrides taking priority. The browser and Python share these rules. Existing income/expense growth assumptions are applied after this starting monthly budget is established. The API model version is 3; an older Python service is rejected with a restart message.

Simulations can include every active node, only checked nodes, or all nodes connected to a checked selection in either direction. Only edges whose endpoints are both included are sent. An isolated investment forecasts that asset without inventing household income, bills, or contributions. The selected scope is shown in the simulation dialog.

Removed nodes are archived in the browser scenario, excluded with their attached routes from calculations, and recoverable from **Restore nodes**. The saved graph and JSON export retain these records and layout coordinates. Undo/redo retains up to 100 actions during the current workspace session, including positions, values, routes, and archives; a new edit discards the redo branch. Reloading retains the current scenario and archive, while starting a new undo history. Import/export remains the way to move a scenario between devices.

Canvas tools are placed in a compact icon dock inside the grid. Fullscreen targets only the canvas, including its dock and inspector overlays. To add a route, drag the right handle of a node onto a destination; the preview follows the pointer and snaps to the destination. Alternatively, choose the connector tool and click source then destination, or focus the handles and press Enter. A dropped route opens an unsaved draft: **Apply connection** commits it, while closing or discarding leaves the graph unchanged. Escape cancels an in-progress connector. Layout, density, and add-node tools remain in the dock; restore/import/export/reset are in its more-actions menu.

Selection and viewport movement use distinct tools. Connect mode uses node drags for connectors and disables viewport gestures; dragging a handle also starts a connector directly. A six-pixel threshold separates intentional drags from click jitter, and native SVG text selection is disabled. Newly added nodes are placed in an unoccupied area near the visible viewport center without rearranging existing accounts. Numeric settings retain unfinished input while focused, so a cleared field stays blank during typing rather than forcing an initial zero back into it. Both private and demo dashboards open on **Overview**.

The editor now separates the cursor, hand/pan, box-select, and connector tools. The cursor selects without panning empty space. Box-select gathers intersecting nodes; Shift extends the selection, and dragging a selected node moves the group with one undo step. Only the hand tool pans the viewport. Delete or Backspace removes the current graph selection while a graph workspace is active, but is left to the input control when typing. Node removal is recoverable through the archive, and line removal through undo. Editing selections and simulation scopes are separate; **Use canvas selection for simulation** explicitly copies the selected nodes into a custom simulation scope.

Overview contains a three-view donut chart. Monthly budget partitions starting gross income into tax, living costs, required loan payments, scheduled investing, scheduled saving, and unassigned cash. When commitments exceed income, an explicit shortfall accompanies the allocation total; no negative sector or artificial income is inserted. Assets groups current checking, savings, and investment balances, while Debts shows each outstanding loan balance. Net worth is displayed separately as assets minus debt. Archived nodes are excluded, and every view uses the same budget rules as the editor and simulation request.

## macOS browser controls and demo defaults

The dashboard accepts Command+Z for undo and Command+Shift+Z for redo, alongside Windows/Linux Control shortcuts. Shift-click and Command-click extend canvas selections. Mac Delete and Fn+Delete remove selected graph items; ordinary editing inside form fields is left to the input. Shortcut hints adapt to the browser platform.

With the hand tool active, two-finger wheel scrolling pans the canvas; pinch gestures continue to zoom. Other tools preserve their selection/drawing behavior, and scrolling is suppressed during a live connection or box gesture. The pinch convention follows the browser's [Control-wheel gesture mapping](https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/ctrlKey). When the [Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen) is unavailable or rejects a request, the canvas expands to fill the browser viewport, with the same exit button and Escape key.

The landing preview and generic demo links default to Mid-Career Family. Missing or invalid dashboard demo profile parameters also select Family; explicit Recent Grad and FIRE selections remain supported. Both demos and private accounts still open on Overview. These are UI changes only; startup scripts and each developer's local database setup are unchanged.

Loan APRs are converted to monthly decimal rates. A debt's payment comes from its explicit override, fixed incoming connections, or 2% of starting principal. An explicit zero is retained. Payments are capped at principal plus accrued interest. The wealth forecast releases each loan's payment when that loan is repaid; it does not silently roll that payment into other loans.

Debt comparison retains the original avalanche/snowball algorithm and its fixed total budget. In that comparison, freed payments deliberately roll into remaining debts. The total accrued interest is accumulated before chart balances are rounded. Income/expense growth controls apply to wealth models, while the debt tool explicitly compares a fixed initial budget.

Monthly net worth is:

```text
checking + savings + investments − contractual loan balances − shortfall borrowing
```

Principal repayment reduces both assets and liabilities; interest is the actual cost. A negative starting net worth is not a negative market asset. Investments cannot drop below zero simply because a normal draw exceeded −100%; manual return draws use log returns and historical adjusted price ratios remain positive.

Checking and savings receive separate effective annual yields. Within each category, starting balance weights are used; initially empty accounts use equal account weights. Deficits consume checking, savings, then investments. Remaining shortfalls are represented as borrowing at the editable APR, and later surplus repays that borrowing before new investing. This is a stress-model assumption, not lending approval; credit limits are not modeled.

## Market history and return assumptions

The team's existing yfinance/SQLite cache now requests `period="max"`, with adjusted prices, a bounded download timeout, a daily cache lifetime, and failure backoff. Cache metadata distinguishes maximum-history downloads from older ten-year caches. Compose retains this data in the `market_cache` volume. Background loading prevents a remote provider from blocking the interactive request.

The active US-stock benchmark is SPY, an explicitly labeled investable proxy with a longer history than VOO. The verified download provided 404 completed monthly returns, from January 1993 to September 2026. Other options use AGG, EFA, and VNQ. Actual dates and counts are returned in every historical model response; no earlier prices are fabricated. Incomplete current months are excluded.

Sources and usage information:

- [yfinance history documentation](https://ranaroussi.github.io/yfinance/reference/api/yfinance.Ticker.history.html)
- [yfinance project and data-use notice](https://github.com/ranaroussi/yfinance)
- [SPY fund information](https://www.ssga.com/us/en/intermediary/etfs/spdr-sp-500-etf-trust-spy)
- [VOO inception and fund information](https://advisors.vanguard.com/investments/products/voo/vanguard-sp-500-etf)

No paid API or API key has been added. The personal educational project still depends on a third-party free provider, so availability is not guaranteed. When data are unavailable, the panel clearly identifies its editable fallback assumptions. Cached history older than 24 hours is identified as stale.

For Monte Carlo, twelve-month blocks preserve observed return shapes and within-block market sequences. For Markov, trailing twelve-month market direction supplies regime labels, transition counts are smoothed, and monthly returns are sampled from the corresponding regime pools. This is a transparent regime approximation, not a fitted predictive HMM or a claim to forecast the next market regime.

The default dashboard uses historical risk with an editable 7% forward-return assumption. Historical log-return observations are shifted to the selected forward drift without changing their variance or the dates used to classify regimes. The observed historical average is displayed separately. Unchecking the forward-return option uses the observed history directly. Manual mode uses editable annual return and volatility; its monthly log mean is `(log(1 + annual return) − annual volatility² / 2) / 12`.

Both active models now use the same disclosed source and forward assumptions. The old unrelated 10% Monte Carlo return and low-return Markov defaults are no longer used by the active endpoint. Retained standalone helpers and existing asset-class mappings remain available for compatibility.

## Growth, inflation, outputs, and limits

The dashboard defaults to 2.5% annual nominal income growth, 2.5% living-cost growth, and a purchasing-power display discounted by 2.5% annual inflation. Tax remains a selected effective percentage, fixed transfers and loan payments remain nominal, and extra portfolio fees default to zero. Already-reflected fund costs are not charged again automatically.

P10/P50/P90 are computed separately at each year across 1,000 paths. They are not three continuous paths or worst/best bounds. Eight individual paths can be displayed separately. The final histogram and target frequencies use those same 1,000 outcomes and the selected dollar basis. Exactly zero net worth is not counted as positive.

The cashflow reference uses identical household rules with cash/market returns and portfolio fees disabled. It is not labeled total invested capital. Investment contributions are reported separately in nominal dollars. Annual audit tables identify nominal budget amounts and inflation-adjusted forecast values; JSON exports contain the request inputs, source metadata, and results, and CSV exports expose annual audit columns.

The model includes only entered expense nodes. It does not invent grocery, transport, insurance, or other missing costs. It does not calculate tax brackets, investment-account contribution limits, capital-gains taxes, retirement dates/withdrawals, changing portfolio allocations, or unlimited-credit feasibility. Income continues through the chosen horizon unless the scenario is changed. Node-level investment APRs are references; market settings determine simulated investment returns.

## Regression checks

- `python-backend/tests/test_demo_models.py` reads the actual V2 SQL demo fixtures and checks gross/net budgets, transfers, loan payoff, shortfalls, checking/savings yields, annuity closed forms, inflation, reproducibility, regime consistency, long-history calibration, and explicit offline fallbacks.
- `frontend/finance.test.js` checks the browser reconciliation against the same demo values, validates assumption imports, and checks affordable allocations and final loan payments.
- Existing simulation, cache, proxy, and session tests remain in place.

Run Python tests with `python -m pytest tests` from `python-backend`. Run browser-side calculation tests with `node --test frontend/finance.test.js frontend/session.test.js frontend/api-proxy.test.js` from the repository root.
