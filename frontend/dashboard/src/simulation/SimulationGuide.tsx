import type { SimulationType } from '../finance';

// Explained the model beside its results in everyday language; distinguished
// calculated scenarios from promises and made the zero-investing case explicit.
export function SimulationGuide({ mode }: { mode: SimulationType }) {
  return (
    <section className="mt-7 p-[clamp(20px,3vw,34px)] border border-[#2b3d51] rounded-[18px] bg-[#121e2b] text-[#afc0d2] leading-[1.8] text-sm wrap-anywhere [&_h3]:text-[#edf5ff] [&_h3]:text-[23px] [&_h3]:my-[10px_18px] [&_h3]:font-semibold [&_h4]:text-[#b4e8d4] [&_h4]:my-[26px_10px] [&_h4]:font-semibold [&_p]:m-0 [&_p]:mb-4 [&_p]:max-w-[85ch] [&_dt]:text-[#e1eafa] [&_dt]:font-semibold [&_dt]:mt-4.25 [&_dd]:my-[5px_16px] [&_dd]:ml-0 [&_dd]:max-w-[85ch]" aria-labelledby="simulation-guide-title">
      <div className="text-[9px] text-[#a9b7ce] tracking-[1.7px] font-semibold mb-2.5">UNDERSTAND YOUR RESULTS</div>
      <h3 id="simulation-guide-title">
        {mode === 'monte_carlo'
          ? 'How the Monte Carlo Simulation works'
          : mode === 'markov'
            ? 'How the Markov simulation works'
            : 'How the debt payoff comparison works'}
      </h3>
      {mode === 'monte_carlo' ? (
        <>
          <p>
            A Monte Carlo simulation asks, “What could happen if the markets took many different
            paths?” FinApp runs your financial plan 1,000 times. Each run starts with the same
            accounts and debts, but receives a different sequence of market returns. The results
            show a range of possibilities rather than a single prediction.
          </p>
          <h4>Where the market paths come from</h4>
          <p>
            With historical calibration, the model uses monthly investment returns from the selected
            benchmark. It samples twelve-month blocks, keeping some of the good and bad months that
            happened together. Blocks can wrap from the end of the available history to its
            beginning. It joins sampled blocks to build each possible future. A benchmark is a
            reference investment, such as SPY for US stocks; it represents the investment pool in
            this model, not every individual holding you might own.
          </p>
          <p>
            With “Use an editable forward return” selected, the past pattern of risk is kept while
            its average return is shifted toward your chosen expectation. The past average is not
            assumed to repeat automatically. With manual assumptions, the model generates monthly
            returns from your expected annual return and volatility instead. Volatility describes
            how widely returns can vary: higher volatility creates a wider range of possible
            outcomes, including larger losses. If history is unavailable, the displayed fallback
            assumptions are used.
          </p>
        </>
      ) : mode === 'markov' ? (
        <>
          <p>
            The Markov simulation also runs 1,000 possible futures, but it lets market conditions
            change between two states: a stronger “bull” market and a weaker “bear” market. A weak
            month can be followed by more weak months, and a strong period can continue. This helps
            explore why the order of gains and losses matters.
          </p>
          <h4>What a market state means</h4>
          <p>
            With historical calibration, the model classifies periods using the preceding twelve
            months of market direction. It estimates how often the market stayed in its current
            state or switched to the other one, then samples monthly returns associated with each
            state. A transition probability means the modeled chance of staying or switching next
            month. A bull state can still contain a losing month, and a bear state can contain a
            gain.
          </p>
          <p>
            With manual assumptions, the two states are constructed around your selected annual
            return and volatility. The default transition pattern spends more time in the stronger
            state, while still allowing weaker periods to cluster. These states are simplified
            descriptions of risk, not a system that predicts when a real market crash will happen.
            The editable forward return changes the modeled average while historical calibration
            retains its observed risk pattern.
          </p>
          <h4>Why the order of returns matters</h4>
          <p>
            A loss early in a plan can have a different effect from the same loss near the end. New
            contributions buy investments at different prices, and withdrawals during a downturn
            leave less invested for a recovery. This is called sequence-of-returns risk. Compare
            this simulation with Monte Carlo using the same budget and assumptions to see how
            different market sequences affect your plan.
          </p>
        </>
      ) : (
        <>
          <p>
            This comparison follows your debts month by month using their balances, annual interest
            rates, and minimum payments. Unlike the investment simulations, it does not create
            random market paths. It compares two repayment priorities using the same starting
            monthly payment budget.
          </p>
          <h4>Avalanche and snowball</h4>
          <p>
            Avalanche puts extra money toward the debt with the highest interest rate first. It aims
            to reduce the cost of interest. Snowball puts extra money toward the smallest balance
            first, helping you clear individual debts sooner. Both cover the required minimums
            before directing extra money toward their priority debt. As a debt finishes, its payment
            is rolled into the next debt while keeping the comparison budget available.
          </p>
          <p>
            The extra-surplus slider controls how much of your starting after-bill surplus is added
            to the required payments. At 0%, the comparison still pays the minimums. A debt's final
            payment is capped at the amount actually owed. If payments do not cover interest, a
            balance can grow; if the selected horizon ends before repayment, the final balance is
            money still owed, not a payoff date.
          </p>
          <h4>Reading the result</h4>
          <p>
            The stacked chart shows how much debt remains over time. Each color represents a debt. A
            section reaches zero when that debt is repaid; the entire stack reaches zero when all
            debts are cleared. “Interest accrued” is the borrowing cost over the displayed period.
            “Monthly payment budget” includes the minimum payments and the selected extra amount.
            This comparison assumes that starting budget stays available; it does not model future
            job loss or new purchases.
          </p>
        </>
      )}
      {mode !== 'debt' && (
        <>
          <h4>How your monthly budget is used</h4>
          <p>
            Gross pay means income before tax. The editable effective tax rate estimates the share
            deducted from that income; it is not a tax-bracket calculator. Take-home pay has already
            been taxed, so no further income-tax deduction is applied when that option is selected.
            Living expenses and required loan payments are then subtracted to find the money
            available after bills.
          </p>
          <p>
            Affordable fixed savings and investment transfers are funded first, followed by
            percentage transfers from the remaining surplus. The investing slider applies to money
            still unassigned after those transfers. For example, the Recent Grad demo has a
            scheduled $200 investment transfer. Moving only the extra-investing slider to 0% leaves
            that scheduled transfer in place. To simulate $0 in new investments, turn off “Include
            scheduled investment transfers” and set the slider to 0%. This changes the current
            experiment without deleting your node connections.
          </p>
          <p>
            Uninvested surplus stays in cash. Moving money from checking to an investment or savings
            account does not itself increase or decrease your net worth: you still own that money.
            Existing investments remain exposed to gains and losses even when new contributions are
            zero. Checking and savings receive their entered yields, while investments follow the
            selected market model and fee estimate.
          </p>
          <h4>Why the lines can rise or fall</h4>
          <p>
            Net worth is cash plus investments minus outstanding debt. Paying loan principal reduces
            cash and debt together; loan interest is a cost. In these household forecasts, a
            finished loan releases its required payment back into the monthly budget. It is not
            automatically rolled into another loan as it is in the separate debt payoff comparison.
          </p>
          <p>
            If expenses, taxes, and payments exceed income, the model uses checking, then savings,
            then investments to cover the shortfall. When those assets run out, it adds borrowing at
            your shortfall interest rate. Later surplus repays that borrowing before making new
            savings transfers. Market losses, persistent shortfalls, borrowing costs, and inflation
            can all push the result down. Zero new investing alone does not mean your money must
            fall: a positive budget can still grow cash or pay down debt.
          </p>
          <p>
            To explore a downturn, choose an editable forward return below 0%. To explore a budget
            problem, increase actual expense nodes or reduce income. Those changes create losses for
            a stated reason rather than forcing the chart downward. Annual income and expense growth
            adjust those amounts over time; a higher expense-growth rate than income-growth rate can
            eventually turn a surplus into a shortfall.
          </p>
          <h4>What the chart terms mean</h4>
          <dl>
            <dt>Median / P50</dt>
            <dd>
              At that year, half of modeled results are below this value and half above. It is the
              middle result, not a guaranteed or “most likely” future.
            </dd>
            <dt>Lower / P10 and upper / P90</dt>
            <dd>
              About 10% of modeled results fall below P10 and 90% below P90 at each year. The shaded
              band covers the middle 80%. Outcomes outside the band remain possible. These lines are
              not the worst and best cases, or three individual market journeys.
            </dd>
            <dt>Sample paths</dt>
            <dd>
              Eight individual simulated journeys, showing the ups and downs hidden by the smoother
              percentile lines. A percentile line can look smooth even when individual investments
              are volatile.
            </dd>
            <dt>Cashflow reference</dt>
            <dd>
              A comparison with investment and cash returns and investment fees switched off. Your
              household cash flows, loan interest, and shortfall borrowing costs still apply. It
              helps separate saving and debt effects from market growth.
            </dd>
            <dt>Today's dollars / inflation</dt>
            <dd>
              Future amounts are reduced by the selected inflation adjustment to show purchasing
              power. An account can grow in dollars while buying less. Nominal dollars show the
              future dollar amount without this display adjustment. The annual budget table keeps
              its cash-flow columns in nominal dollars and labels forecast units separately.
            </dd>
            <dt>Compressed scale</dt>
            <dd>
              Large balances are squeezed closer together to make small and negative values easier
              to see. Zero and negative signs are preserved, but equal vertical distances no longer
              represent equal dollar changes.
            </dd>
            <dt>Outcome distribution and target probability</dt>
            <dd>
              The bars count where the 1,000 paths end. Positive-net-worth and target percentages
              describe this set of modeled endings; they are not real-world guarantees. The first
              positive median year is a yearly net-worth observation, not necessarily the date every
              loan is repaid.
            </dd>
          </dl>
          <h4>What this model leaves out</h4>
          <p>
            The results depend on the accounts, expenses, and assumptions you enter. They do not
            automatically add missing living costs, job loss, retirement withdrawals, changing tax
            brackets, contribution limits, or every possible crisis. Historical data is a limited
            sample, and future markets may behave differently. Use the year-by-year table and
            exported results to check the budget, compare scenarios, and understand the assumptions
            behind the picture.
          </p>
        </>
      )}
    </section>
  );
}
