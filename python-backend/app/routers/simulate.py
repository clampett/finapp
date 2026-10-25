from typing import Literal
from fastapi import APIRouter
from pydantic import BaseModel, Field, ConfigDict, model_validator
from app.debt_waterfall import DebtItem, simulate_debt_waterfall
from app.projection import project_household
from app.cashflow import saving_plan, monthly_budget
from app.market_model import get_market_model

router = APIRouter()


# Rejected non-finite numbers and excessive amounts before NumPy or repayment
# loops were reached; these bounds matched the browser's scenario validation.
class NodeInput(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=100)
    type: Literal["INCOME", "EXPENSE", "DEBT", "CHECKING", "SAVINGS", "INVESTMENT"]
    balance: float = Field(ge=0, le=1e12)
    apr: float = Field(default=0, ge=0, le=100)
    min_payment: float | None = Field(default=None, ge=0, le=1e9)


class EdgeInput(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    source: str
    target: str
    monthly_fixed_flow: float | None = Field(default=None, ge=0, le=1e9)
    percentage_flow: float | None = Field(default=None, ge=0, le=100)


class SimulationRequest(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    investment_rate: float = Field(default=100, ge=0, le=100)
    inflation_rate: float = Field(default=0, ge=0, le=0.25)
    sim_type: Literal["monte_carlo", "markov", "debt"]
    years: int = Field(default=30, ge=1, le=50)
    # Retained net-income defaults for older callers; the updated dashboard sent
    # its explicit gross/net choice and editable effective tax estimate.
    income_basis: Literal["gross", "net"] = "net"
    tax_rate: float = Field(default=0, ge=0, le=0.6)
    income_growth: float = Field(default=0, ge=-0.5, le=0.25)
    expense_growth: float = Field(default=0, ge=-0.25, le=0.25)
    annual_fee: float = Field(default=0, ge=0, le=0.1)
    borrowing_apr: float = Field(default=0.12, ge=0, le=1)
    market_source: Literal["historical", "manual"] = "manual"
    historical_return_mode: Literal["observed", "forward"] = "observed"
    asset_class: Literal["US_STOCKS", "BONDS", "INTL_STOCKS", "REAL_ESTATE"] = "US_STOCKS"
    annual_return: float = Field(default=0.07, gt=-1, le=0.5)
    annual_volatility: float = Field(default=0.15, ge=0, le=1)
    target: float = Field(default=500000, ge=0, le=1e12)
    nodes: list[NodeInput] = Field(max_length=200)
    edges: list[EdgeInput] = Field(default_factory=list, max_length=500)

    @model_validator(mode="after")
    def unique_nodes(self):
        # Reserved chart field names and required one valid amount mode per edge,
        # preventing imported account IDs from overwriting monthly chart metadata.
        ids = [n.id for n in self.nodes]
        if set(ids) & {"month", "freed_cash_flow"}:
            raise ValueError("Account ID conflicts with a reserved chart field")
        if len(ids) != len(set(ids)):
            raise ValueError("Every account needs a unique ID")
        for e in self.edges:
            if e.source not in ids or e.target not in ids or e.source == e.target:
                raise ValueError("Connections must reference two different existing accounts")
            if (e.monthly_fixed_flow is None) == (e.percentage_flow is None):
                raise ValueError("Each connection needs a fixed amount or a percentage")
        return self


@router.post("/api/simulate")
def run_simulation(payload: SimulationRequest):
    # Interpreted income and expense node values as monthly flows, while account
    # and debt values were treated as balances rather than recurring contributions.
    income = sum(n.balance for n in payload.nodes if n.type == "INCOME")
    expenses = sum(n.balance for n in payload.nodes if n.type == "EXPENSE")
    debts = []
    for n in payload.nodes:
        if n.type != "DEBT":
            continue
        # Applied payment precedence: explicit node override, fixed incoming
        # connections, then 2% of starting principal. An explicit zero was retained.
        fixed = [
            e.monthly_fixed_flow
            for e in payload.edges
            if e.target == n.id and e.monthly_fixed_flow is not None
        ]
        minimum = (
            n.min_payment
            if n.min_payment is not None
            else (sum(fixed) if fixed else n.balance * 0.02)
        )
        # Capped the first required payment at principal plus one month's interest,
        # so a tiny final balance did not consume an impossible full minimum.
        minimum = min(minimum, n.balance * (1 + n.apr / 1200))
        debts.append(DebtItem(n.id, n.name, n.balance, n.apr / 100, minimum))
    # Converted percentage APR to decimal APR above; the debt engine performed
    # the remaining annual-to-monthly conversion before accruing interest.
    minimums = sum(d.min_payment for d in debts if d.balance > 0)
    plan = saving_plan(payload.nodes, payload.edges)
    budget = monthly_budget(
        income,
        expenses,
        minimums,
        payload.income_basis,
        payload.tax_rate,
        plan,
        payload.investment_rate,
    )
    surplus = budget["monthly_surplus"]
    contribution = max(0, surplus) * payload.investment_rate / 100
    initial = sum(
        n.balance for n in payload.nodes if n.type in ("CHECKING", "SAVINGS", "INVESTMENT")
    ) - sum(d.balance for d in debts)
    result = {
        "status": "success",
        "model_version": 2,
        "inputs": payload.model_dump(),
        "metrics": {
            **budget,
            "initial_investment": initial,
            "initial_cash": sum(
                n.balance for n in payload.nodes if n.type in ("CHECKING", "SAVINGS")
            ),
            "initial_market_assets": sum(
                n.balance for n in payload.nodes if n.type == "INVESTMENT"
            ),
            "initial_debt": sum(d.balance for d in debts),
            "years": payload.years,
        },
        "assumptions": [
            f"Income basis: {payload.income_basis}; estimated effective tax {budget['effective_tax_rate']:.1%}. This is not a tax-bracket calculation.",
            f"Income grows {payload.income_growth:.1%} and living expenses grow {payload.expense_growth:.1%} annually; debt payments stay nominal until payoff.",
            "Investments earn simulated returns. Checking and savings are pooled separately at their starting balance-weighted annual yields (equal account weights if initially empty). Loans accrue their own APR.",
            f"Uninvested money stays in cash. Deficits use cash, investments, then borrowing at {payload.borrowing_apr:.1%} APR; later surplus repays that borrowing first.",
            "Wealth forecasts pay debt minimums; the debt tool compares allocating extra surplus.",
            "Debt overrides take precedence over fixed debt connections. Fixed savings/investment routes are funded first; percentage routes use the remaining after-bill surplus.",
            "The allocation slider invests a share of still-unassigned money, in addition to scheduled investment transfers. Transfers never create or destroy household wealth.",
            "Percentages above 100% are scaled to the affordable budget. Fixed transfers are reduced proportionally if the available surplus is insufficient.",
            f"Portfolio fee: {payload.annual_fee:.2%} per year. All investment accounts share the selected benchmark; individual investment-node APRs do not override simulated market returns.",
            "The cashflow reference uses the same income, expenses, loan and borrowing rules with asset returns and portfolio fees disabled.",
            "P10/P50/P90 are annual cross-sectional quantiles, not continuous bear/bull paths or guarantees. Probabilities are frequencies among 1,000 simulated paths.",
            "Only entered expenses are deducted; unlisted living costs, retirement withdrawals, tax brackets, account limits, and transaction taxes are not estimated.",
            "Debt payment defaults to 2% of starting principal when no fixed connection or override is provided.",
        ],
        "warnings": [],
    }
    if payload.sim_type == "debt":
        # Compared both repayment priorities under the same affordable payment
        # budget, without liquidating existing cash or investment accounts.
        result["assumptions"] = [
            f"The fixed debt budget uses {payload.income_basis} income after the selected tax estimate; income/expense growth controls apply to wealth models only.",
            "The payment budget comes from monthly cash flow, without liquidating existing assets.",
            "Minimums plus the chosen share of surplus form a fixed payment budget; freed payments roll into remaining loans.",
            "If cash flow cannot cover minimums, payments are reduced and unpaid balances keep accruing interest.",
            "A fixed incoming debt connection sets the payment unless overridden; otherwise 2% of starting principal is assumed.",
            "Loan APRs are fixed. Interest is charged monthly before payments. No fees or new purchases are modeled.",
        ]
        extra = contribution if surplus >= 0 else surplus
        result["metrics"]["monthly_contribution"] = max(0, extra)
        result["assumptions"].append(
            "This comparison redirects the selected share of after-bill surplus to loans, independently of existing saving/investment routes."
        )
        result["debt"], result["debt_summary"] = {}, {}
        result["debt_labels"] = {d.id: d.name for d in debts if d.balance > 0}
        for strategy in ("avalanche", "snowball"):
            rows, _, diagnostics = simulate_debt_waterfall(
                debts, extra, strategy, payload.years * 12, detailed=True
            )
            # Reported an unfinished balance explicitly instead of labeling the
            # last simulated month as a debt-free date when the horizon was reached.
            remaining = sum(rows[-1].get(d.id, 0) for d in debts)
            interest = diagnostics["interest"]
            result["debt"][strategy] = rows
            result["debt_summary"][strategy] = {
                "paid_off": remaining < 0.005,
                "months": rows[-1]["month"] if remaining < 0.005 else None,
                "remaining_balance": round(remaining, 2),
                "total_interest": round(interest, 2),
                "monthly_budget": max(0, minimums + extra),
            }
    else:
        # Delegated active wealth forecasts to the household engine, which kept
        # cash, market assets, existing loans, and new borrowing in separate ledgers.
        market = get_market_model(
            payload.asset_class,
            payload.market_source,
            payload.annual_return,
            payload.annual_volatility,
            payload.historical_return_mode,
        )
        forecast, baseline, details = project_household(
            payload.nodes,
            debts,
            income,
            expenses,
            payload.investment_rate,
            payload.inflation_rate,
            payload.years,
            payload.sim_type,
            plan=plan,
            market=market,
            income_basis=payload.income_basis,
            tax_rate=payload.tax_rate,
            income_growth=payload.income_growth,
            expense_growth=payload.expense_growth,
            annual_fee=payload.annual_fee,
            borrowing_apr=payload.borrowing_apr,
            target=payload.target,
            detailed=True,
        )
        result.update(details)
        if market.metadata["status"] == "fallback":
            result["warnings"].append(
                "Free market history is loading or unavailable. The displayed fallback assumptions have been used; refresh the forecast after loading finishes."
            )
        result[payload.sim_type] = forecast
        result["metrics"]["no_growth_baseline"] = baseline
    if payload.sim_type != "debt" and plan.investment_percent + plan.savings_percent > 100:
        result["warnings"].append(
            "Savings/investment percentages exceed 100%; they have been scaled proportionally to available money."
        )
    if payload.sim_type != "debt" and plan.investment_fixed + plan.savings_fixed > max(0, surplus):
        result["warnings"].append(
            "Scheduled transfers exceed after-bill income; only affordable amounts have been funded."
        )
    if any(d.balance > 0 and d.min_payment < d.balance * d.apr / 12 for d in debts):
        result["warnings"].append(
            "At least one loan payment does not cover its starting interest; that balance can grow."
        )
    return result
