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
