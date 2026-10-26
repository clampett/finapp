"""Checked the active models against the actual seeded demo scenarios."""

import re
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from app.cashflow import SavingPlan
from app.debt_waterfall import DebtItem, minimum_payment_schedule
from app.markov_sim import MarkovRegimeSimulator
from app.market_model import calibrate_prices
from app.routers.simulate import SimulationRequest, run_simulation


def seeded_demo(profile, **overrides):
    # Read the committed SQL fixture rather than inventing a second set of demo
    # balances; changes to the classroom examples therefore reached these checks.
    sql = (
        Path(__file__).resolve().parents[2]
        / "java-backend/src/main/resources/db/migration/V2__Seed_archetypes.sql"
    ).read_text(encoding="utf-8")
    nodes = []
    for match in re.finditer(
        r"\((\d+),\s*(\d+),\s*'(INCOME|CHECKING|SAVINGS|INVESTMENT|DEBT|EXPENSE)',\s*'([^']+)',\s*([\d.]+),\s*([\d.]+)\)",
        sql,
    ):
        node_id, user_id, kind, name, balance, apr = match.groups()
        if int(user_id) == profile:
            nodes.append(
                dict(id=node_id, type=kind, name=name, balance=float(balance), apr=float(apr))
            )
    ids = {n["id"] for n in nodes}
    edges = []
    for match in re.finditer(r"INSERT INTO node_edges \(([^)]+)\) VALUES\s*(.*?);", sql, re.S):
        mode = "percentage_flow" if "percentage_flow" in match[1] else "monthly_fixed_flow"
        for source, target, amount in re.findall(r"\((\d+),\s*(\d+),\s*([\d.]+)\)", match[2]):
            if source in ids and target in ids:
                edges.append(dict(source=source, target=target, **{mode: float(amount)}))
    return SimulationRequest(
        **(
            dict(
                nodes=nodes,
                edges=edges,
                sim_type="monte_carlo",
                income_basis="gross",
                tax_rate=0.20,
                investment_rate=0,
                annual_return=0,
                annual_volatility=0,
                years=1,
            )
            | overrides
        )
    )


@pytest.mark.parametrize(
    "profile,gross,taxes,surplus,invest,savings,free,worth",
    [
        (1, 4583.33, 916.666, 1816.664, 200, 0, 1616.664, -27000),
        (2, 11250, 2250, 3950, 1100, 300, 2550, 95200),
        (3, 8166.67, 1633.334, 4333.336, 3033.3352, 216.6668, 1083.334, 139500),
    ],
)
def test_seeded_demo_budget(profile, gross, taxes, surplus, invest, savings, free, worth):
    result = run_simulation(seeded_demo(profile))
    metrics = result["metrics"]
    for field, expected in dict(
        monthly_income=gross,
        monthly_taxes=taxes,
        monthly_surplus=surplus,
        planned_investment=invest,
        planned_savings=savings,
        unassigned_surplus=free,
        initial_investment=worth,
    ).items():
        assert metrics[field] == pytest.approx(expected)
    assert metrics["monthly_contribution"] == pytest.approx(invest)
    assert result["monte_carlo"][0]["p50"] == worth


@pytest.mark.parametrize("profile", [1, 2, 3])
@pytest.mark.parametrize("sim_type", ["monte_carlo", "markov"])
def test_all_demo_forecasts_conserve_wealth_without_returns(profile, sim_type):
    # Removed all yields and borrowing interest for this controlled comparison;
    # verified both engines against the same accounting identity for every demo.
    payload = seeded_demo(profile, sim_type=sim_type, borrowing_apr=0)
    for node in payload.nodes:
        node.apr = 0
    result = run_simulation(payload)
    metrics = result["metrics"]
    expected = metrics["initial_investment"] + 12 * (
        metrics["take_home_income"] - metrics["monthly_expenses"]
    )
    for point in result[sim_type]:
        assert point["p10"] == pytest.approx(point["p50"])
        assert point["p90"] == pytest.approx(point["p50"])
    assert result[sim_type][-1]["p50"] == pytest.approx(expected, abs=0.02)


@pytest.mark.parametrize("profile", [1, 2, 3])
@pytest.mark.parametrize("sim_type", ["monte_carlo", "markov"])
def test_all_profiles_can_pause_new_investments(profile, sim_type):
    # Paused new investment routes without erasing existing investment balances;
    # retained savings transfers and confirmed zero contributions in both engines.
    payload = seeded_demo(profile, sim_type=sim_type, investment_rate=0)
    investment_ids = {node.id for node in payload.nodes if node.type == "INVESTMENT"}
    payload.edges = [edge for edge in payload.edges if edge.target not in investment_ids]
    result = run_simulation(payload)
    assert result["metrics"]["monthly_contribution"] == 0
    assert result["summary"]["median_contributions"] == 0
    assert result[sim_type][0]["p50"] == result["metrics"]["initial_investment"]


def test_sustained_losses_reduce_existing_investments_without_new_contributions():
    # Checked a deterministic downturn separately from a zero-contribution choice;
    # verified a large decline without manufacturing a negative investment balance.
    result = run_simulation(
        request(
            [dict(type="INVESTMENT", balance=10000)],
            years=5,
            investment_rate=0,
            annual_return=-0.5,
        )
    )
    assert result["monte_carlo"][-1]["p50"] == pytest.approx(312.5)


def test_take_home_choice_does_not_deduct_tax_twice():
    metrics = run_simulation(seeded_demo(1, income_basis="net"))["metrics"]
    assert metrics["monthly_taxes"] == 0
    assert metrics["monthly_surplus"] == pytest.approx(2733.33)


@pytest.mark.parametrize("sim_type", ["monte_carlo", "markov", "debt"])
def test_edited_expense_routes_reached_every_simulation(sim_type):
    # Updated a route rather than its expense default; checked shared model
    # inputs so a relabeled graph could not leave disposable income unchanged.
    payload = seeded_demo(1, sim_type=sim_type)
    expense = next(node for node in payload.nodes if node.type == "EXPENSE")
    route = next(edge for edge in payload.edges if edge.target == expense.id)
    route.monthly_fixed_flow = 1800
    result = run_simulation(payload)
    assert result["metrics"]["monthly_expenses"] == 1800
    assert result["metrics"]["monthly_surplus"] == pytest.approx(1416.664)


def test_percentage_expense_and_debt_routes_used_starting_take_home():
    payload = seeded_demo(1)
    targets = {node.id for node in payload.nodes if node.type in ("EXPENSE", "DEBT")}
    for edge in payload.edges:
        if edge.target in targets:
            edge.monthly_fixed_flow = None
            edge.percentage_flow = 10
    result = run_simulation(payload)
    take_home = 4583.33 * 0.8
    assert result["metrics"]["monthly_expenses"] == pytest.approx(take_home * 0.1)
    assert result["metrics"]["minimum_debt_payments"] == pytest.approx(take_home * 0.2)


def test_manual_zero_returns_conserve_household_wealth():
    payload = seeded_demo(1)
    result = run_simulation(payload)
    flow = result["yearly_cashflow"][0]
    expected = (
        result["metrics"]["initial_investment"]
        + flow["income"]
        - flow["taxes"]
        - flow["expenses"]
        - flow["debt_interest"]
    )
    assert result["monte_carlo"][-1]["p50"] == pytest.approx(expected, abs=0.02)
    # Counted investment transfers once: the $200 plan moved cash into assets
    # without being deducted from net worth as though it had been spent.
    assert result["summary"]["median_contributions"] == 2400


def request(nodes, **overrides):
    return SimulationRequest(
        **(
            dict(
                nodes=[dict(id=str(i), name="Account", **n) for i, n in enumerate(nodes)],
                sim_type="monte_carlo",
                years=1,
                annual_return=0,
                annual_volatility=0,
            )
            | overrides
        )
    )


def test_risk_free_annuity_matches_closed_form():
    result = run_simulation(
        request(
            [dict(type="INVESTMENT", balance=100), dict(type="INCOME", balance=100)],
            annual_return=0.07,
        )
    )
    monthly = 1.07 ** (1 / 12) - 1
    expected = 100 * 1.07 + 100 * (1.07 - 1) / monthly
    assert result["monte_carlo"][-1]["p50"] == pytest.approx(expected)


def test_each_loan_payment_was_released_at_its_own_payoff():
    schedule = minimum_payment_schedule(
        [DebtItem("a", "A", 100, 0, 100), DebtItem("b", "B", 300, 0, 100)], 3
    )
    assert [row["payment"] for row in schedule] == [0, 200, 100, 100]
    assert schedule[-1]["balance"] == 0


def test_shortfall_borrowing_has_no_negative_market_asset():
    result = run_simulation(
        request(
            [dict(type="CHECKING", balance=100), dict(type="EXPENSE", balance=100)], borrowing_apr=0
        )
    )
    assert result["monte_carlo"][-1]["p50"] == -1100
    assert result["summary"]["median_borrowing"] == 1100


def test_zero_net_worth_was_not_reported_as_positive():
    result = run_simulation(request([]))
    assert result["summary"]["probability_positive"] == 0
    assert result["summary"]["first_positive_median_year"] is None


def test_negative_net_worth_accrues_contract_apr_not_stock_returns():
    result = run_simulation(
        request(
            [dict(type="DEBT", balance=1000, apr=12, min_payment=0)],
            annual_return=0.2,
            annual_volatility=0.8,
        )
    )
    point = result["monte_carlo"][-1]
    assert point["p10"] == point["p90"]
    assert point["p50"] == pytest.approx(-1000 * 1.01**12)


def test_checking_did_not_receive_savings_interest():
    result = run_simulation(
        request(
            [dict(type="CHECKING", balance=200, apr=0), dict(type="SAVINGS", balance=100, apr=12)]
        )
    )
    assert result["monte_carlo"][-1]["p50"] == pytest.approx(312)


def test_fixed_saving_plan_was_capped_without_new_borrowing():
    plan = SavingPlan(investment_fixed=400, savings_fixed=600)
    allocation = plan.allocate(100, 100)
    assert allocation["investment"] == 40
    assert allocation["cash"] == 60
    assert allocation["investment"] + allocation["cash"] == 100


def test_growth_was_applied_annually_and_inflation_only_to_display():
    result = run_simulation(
        request(
            [dict(type="INCOME", balance=100)],
            years=2,
            income_growth=0.1,
            inflation_rate=0.025,
            investment_rate=0,
        )
    )
    assert result["yearly_cashflow"][0]["income"] == 1200
    assert result["yearly_cashflow"][1]["income"] == 1320
    assert result["monte_carlo"][-1]["p50"] == pytest.approx(2520 / 1.025**2)


def test_markov_and_monte_carlo_shared_marginal_assumptions():
    rng = np.random.default_rng(42)
    engine = MarkovRegimeSimulator.from_assumptions(0.07, 0.15)
    states = rng.choice([0, 1], size=100000, p=engine.initial_probabilities)
    logs = np.log1p(engine.draw_returns(states, rng))
    assert logs.mean() == pytest.approx((np.log1p(0.07) - 0.15**2 / 2) / 12, abs=0.0005)
    assert logs.var() == pytest.approx(0.15**2 / 12, abs=0.00005)


def test_long_history_calibration_used_completed_months():
    dates = pd.bdate_range("1993-01-01", "2026-10-10")
    prices = pd.Series(100 * np.exp(np.arange(len(dates)) * 0.0002), index=dates)
    market = calibrate_prices(prices)
    assert market.metadata["years"] > 30
    assert market.metadata["observations"] > 360
    assert market.metadata["end"] == "2026-09-30"
    assert market.metadata["ticker"] == "SPY"
    assert market.returns.min() > -1


def test_history_unavailable_was_explicit_and_did_not_wait_for_download(monkeypatch):
    from app import market_model

    monkeypatch.setattr(market_model, "_models", {})
    monkeypatch.setattr(market_model, "_jobs", {})
    monkeypatch.setattr(market_model, "cached_prices", lambda ticker: pd.Series(dtype=float))
    monkeypatch.setattr(market_model, "warm_market", lambda asset: None)
    model = market_model.get_market_model("US_STOCKS", "historical", 0.06, 0.18)
    assert model.metadata["status"] == "fallback"
    assert model.metadata["annual_return"] == 0.06
    assert model.returns is None


def test_forward_return_preserved_historical_risk_and_regime_dates(monkeypatch):
    from app import market_model

    rng = np.random.default_rng(13)
    dates = pd.date_range("1983-01-31", periods=400, freq="ME")
    prices = pd.Series(100 * np.exp(np.cumsum(rng.normal(0.01, 0.05, 400))), index=dates)
    original = calibrate_prices(prices)
    saved_returns = original.returns.copy()
    monkeypatch.setattr(market_model, "_models", {"US_STOCKS": original})
    monkeypatch.setattr(market_model, "_jobs", {})
    monkeypatch.setattr(market_model, "warm_market", lambda asset: None)
    adjusted = market_model.get_market_model("US_STOCKS", "historical", 0.07, 0.15, "forward")
    assert adjusted.metadata["annual_return"] == 0.07
    assert adjusted.metadata["observed_annual_return"] == original.metadata["annual_return"]
    assert np.std(np.log1p(adjusted.returns)) == pytest.approx(np.std(np.log1p(saved_returns)))
    assert np.array_equal(original.returns, saved_returns)
    before = MarkovRegimeSimulator.from_monthly_returns(original.returns)
    after = MarkovRegimeSimulator.from_monthly_returns(adjusted.returns, adjusted.regime_returns)
    assert np.array_equal(before.P, after.P)


def test_manual_distribution_was_repeatable_finite_and_ordered():
    payload = seeded_demo(
        1,
        annual_return=0.07,
        annual_volatility=0.15,
        years=30,
        income_growth=0.025,
        expense_growth=0.025,
    )
    for mode in ("monte_carlo", "markov"):
        payload.sim_type = mode
        first, second = run_simulation(payload), run_simulation(payload)
        assert first[mode] == second[mode]
        assert sum(bin["count"] for bin in first["ending_distribution"]) == 1000
        for point in first[mode]:
            assert np.isfinite(point["p50"])
            assert point["p10"] <= point["p50"] <= point["p90"]
