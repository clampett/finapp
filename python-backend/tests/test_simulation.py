import unittest
from types import SimpleNamespace
from app.debt_waterfall import DebtItem, simulate_debt_waterfall
from app.projection import project_household
from app.routers.simulate import SimulationRequest, run_simulation
from pydantic import ValidationError


def node(kind, balance, apr=0, id="1", name="Account", **kwargs):
    return dict(id=id, name=name, type=kind, balance=balance, apr=apr, **kwargs)


class DebtTests(unittest.TestCase):
    # Verified payment affordability and rollover with small deterministic loans,
    # making accidental double-counting visible without relying on market randomness.
    def test_extra_budget_includes_minimums_once_and_stops_on_payoff(self):
        rows, _ = simulate_debt_waterfall([DebtItem("a", "Loan", 1000, 0, 100)], 100)
        self.assertEqual(rows[-1]["month"], 5)
        self.assertEqual(rows[-1]["a"], 0)
        self.assertGreater(rows[-2]["a"], 0)

    def test_shortfall_does_not_invent_minimum_payments(self):
        rows, _ = simulate_debt_waterfall(
            [DebtItem("a", "Loan", 1000, 0.12, 100)], -200, max_months=1
        )
        self.assertEqual(rows[-1]["a"], 1010)

    def test_duplicate_names_keep_separate_accounts(self):
        rows, _ = simulate_debt_waterfall(
            [DebtItem("a", "Loan", 100, 0, 50), DebtItem("b", "Loan", 200, 0, 50)], 0
        )
        self.assertEqual(rows[0]["a"], 100)
        self.assertEqual(rows[0]["b"], 200)
        self.assertEqual(rows[-1]["month"], 3)

    def test_freed_payments_roll_into_remaining_debt(self):
        rows, _ = simulate_debt_waterfall(
            [DebtItem("a", "A", 100, 0, 100), DebtItem("b", "B", 300, 0, 100)], 0
        )
        self.assertEqual(rows[-1]["month"], 2)
        self.assertEqual(rows[-1]["b"], 0)


class ForecastTests(unittest.TestCase):
    # Exercised the public request model and active household calculation together,
    # preserving coverage of both validation and cash/debt accounting behavior.
    def simulate(self, nodes, mode="monte_carlo", **kwargs):
        return run_simulation(SimulationRequest(nodes=nodes, sim_type=mode, **kwargs))

    def test_zero_allocation_retains_surplus_in_cash(self):
        result = self.simulate(
            [node("INCOME", 1000), node("CHECKING", 100, id="2")], investment_rate=0, years=1
        )
        end = result["monte_carlo"][-1]
        self.assertAlmostEqual(end["p50"], 12100)
        self.assertEqual(end["p10"], end["p90"])

    def test_market_returns_do_not_apply_to_negative_net_worth(self):
        result = self.simulate([node("DEBT", 1000, 12, min_payment=0)], "markov", years=1)
        end = result["markov"][-1]
        self.assertEqual(end["p10"], end["p90"])
        self.assertLess(end["p50"], -1000)

    def test_deficit_depletes_reserves_and_creates_borrowing(self):
        result = self.simulate([node("CHECKING", 100), node("EXPENSE", 100, id="2")], years=1)
        self.assertLess(result["monte_carlo"][-1]["p50"], -1100)

    def test_debt_payments_preserve_principal_in_net_worth(self):
        result = self.simulate(
            [node("INCOME", 100), node("DEBT", 1000, id="2", min_payment=100)],
            investment_rate=0,
            years=1,
        )
        self.assertAlmostEqual(result["monte_carlo"][-1]["p50"], 200, places=2)

    def test_zero_apr_and_fixed_connection_are_respected(self):
        result = self.simulate(
            [node("INCOME", 100), node("DEBT", 1000, id="2")],
            "debt",
            investment_rate=0,
            years=1,
            edges=[dict(source="1", target="2", monthly_fixed_flow=100)],
        )
        summary = result["debt_summary"]["avalanche"]
        self.assertEqual(summary["months"], 10)
        self.assertEqual(summary["total_interest"], 0)
        self.assertEqual(summary["monthly_budget"], 100)

    def test_unpaid_debt_is_not_reported_as_paid_off(self):
        result = self.simulate([node("DEBT", 10000, 20, min_payment=1)], "debt", years=1)
        self.assertFalse(result["debt_summary"]["avalanche"]["paid_off"])
        self.assertIsNone(result["debt_summary"]["avalanche"]["months"])

    def test_percentiles_ordered_and_seed_repeatable(self):
        nodes = [node("INVESTMENT", 10000), node("INCOME", 100, id="2")]
        for mode in ["monte_carlo", "markov"]:
            a = self.simulate(nodes, mode, years=2)
            b = self.simulate(nodes, mode, years=2)
            self.assertEqual(a[mode], b[mode])
            for point in a[mode]:
                self.assertLessEqual(point["p10"], point["p50"])
                self.assertLessEqual(point["p50"], point["p90"])
            self.assertEqual(len(a[mode]), 3)

    def test_inflation_discount_applies_to_forecast_and_reference(self):
        nodes = [node("CHECKING", 100)]
        result = self.simulate(nodes, investment_rate=0, inflation_rate=0.025, years=1)
        self.assertAlmostEqual(result["monte_carlo"][-1]["p50"], 100 / 1.025)
        self.assertAlmostEqual(result["metrics"]["no_growth_baseline"], 100 / 1.025)

    def test_non_monthly_income_and_expense_frequencies(self):
        # Biweekly income: $2000 biweekly -> ~$4333.33/month
        # Yearly expense: $12000 yearly -> $1000/month
        nodes = [
            node("INCOME", 2000, frequency="biweekly", interval_count=1, id="inc-1"),
            node("EXPENSE", 12000, frequency="yearly", interval_count=1, id="exp-1"),
            node("CHECKING", 1000, id="chk-1"),
        ]
        result = self.simulate(nodes, "monte_carlo", investment_rate=0, years=1)
        self.assertAlmostEqual(result["metrics"]["monthly_income"], 4333.33, places=1)
        self.assertAlmostEqual(result["metrics"]["monthly_expenses"], 1000.0, places=1)
        # Expected monthly surplus is roughly 4333.33 - 1000 = 3333.33
        self.assertAlmostEqual(result["metrics"]["monthly_surplus"], 3333.33, places=1)
        # Net worth after 12 months with 0% extra investment and 0 return should grow by 12 * surplus
        expected_end = 1000 + 3333.33 * 12
        self.assertAlmostEqual(result["monte_carlo"][-1]["p50"], expected_end, delta=50)

    def test_recurring_transactions_integrated_into_all_simulations(self):
        nodes = [
            node("CHECKING", 500, id="chk-1"),
            node("DEBT", 5000, 10, id="debt-1", min_payment=100),
        ]
        recurring = [
            dict(
                id="rec-1",
                kind="income",
                amount=1000,
                frequency="weekly",
                interval_count=1,
                is_active=True,
                description="Freelance Weekly",
            ),
            dict(
                id="rec-2",
                kind="expense",
                amount=300,
                frequency="quarterly",
                interval_count=1,
                is_active=True,
                description="Car Insurance",
            ),
        ]
        # Weekly $1000 -> ~$4333.33/mo
        # Quarterly $300 -> $100/mo
        # Minimums -> $100/mo
        for sim_type in ("monte_carlo", "markov", "debt"):
            result = self.simulate(
                nodes,
                sim_type,
                investment_rate=0,
                years=1,
                recurring_transactions=recurring,
            )
            self.assertAlmostEqual(result["metrics"]["monthly_income"], 4333.33, places=1)
            self.assertAlmostEqual(result["metrics"]["monthly_expenses"], 100.0, places=1)
            self.assertAlmostEqual(result["metrics"]["monthly_surplus"], 4333.33 - 100.0 - 100.0, places=1)

    def test_linked_recurring_transactions_avoid_double_counting(self):
        nodes = [
            node("INCOME", 3000, id="inc-1", name="Salary"),
            node("CHECKING", 1000, id="chk-1"),
        ]
        recurring = [
            # Explicitly linked via notes
            dict(
                id="rec-1",
                kind="income",
                amount=3000,
                frequency="monthly",
                is_active=True,
                notes="[node-id:inc-1] Salary node",
            ),
            # Matching description
            dict(
                id="rec-2",
                kind="income",
                amount=3000,
                frequency="monthly",
                is_active=True,
                description="Salary",
            ),
        ]
        result = self.simulate(
            nodes,
            "monte_carlo",
            investment_rate=0,
            years=1,
            recurring_transactions=recurring,
        )
        # Income should remain 3000, not 6000 or 9000
        self.assertAlmostEqual(result["metrics"]["monthly_income"], 3000.0, places=2)

    def test_process_and_simulate_supports_non_monthly_frequencies(self):
        from app.simulation import process_and_simulate

        nodes = [
            dict(id="1", name="Weekly Pay", type="INCOME", balance=500, frequency="weekly"),
            dict(id="2", name="Annual Sub", type="EXPENSE", balance=1200, frequency="yearly"),
            dict(id="3", name="Checking", type="CHECKING", balance=2000),
        ]
        # Weekly $500 -> ~$2166.67/mo
        # Annual $1200 -> $100/mo
        # Net cash flow = ~2066.67/mo
        res = process_and_simulate(nodes, investment_rate=50, annual_return=0.0, annual_volatility=0.0, years=1, seed=42)
        # Year 0 balance is 2000
        self.assertEqual(res[0]["p50"], 2000.0)
        # Year 1 balance should be 2000 + 12 * (2066.67 * 0.5) = 2000 + 12400 = 14400
        self.assertAlmostEqual(res[1]["p50"], 2000 + (2166.67 - 100) * 0.5 * 12, delta=20)

    def test_invalid_payloads_rejected(self):
        for change in [
            dict(investment_rate=101),
            dict(inflation_rate=float("nan")),
            dict(years=0),
            dict(sim_type="unknown"),
            dict(nodes=[node("DEBT", -1)]),
            dict(nodes=[node("CHECKING", 1), node("SAVINGS", 1)]),
        ]:
            with self.assertRaises(ValidationError):
                SimulationRequest(**(dict(nodes=[], sim_type="monte_carlo") | change))


if __name__ == "__main__":
    unittest.main()
