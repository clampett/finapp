from typing import Literal
from fastapi import APIRouter
from pydantic import BaseModel, Field, ConfigDict, model_validator
from app.debt_waterfall import DebtItem, simulate_debt_waterfall
from app.projection import project_household

router = APIRouter()

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
    nodes: list[NodeInput] = Field(max_length=200)
    edges: list[EdgeInput] = Field(default_factory=list, max_length=500)

    @model_validator(mode="after")
    def unique_nodes(self):
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
    income = sum(n.balance for n in payload.nodes if n.type == "INCOME")
    expenses = sum(n.balance for n in payload.nodes if n.type == "EXPENSE")
    debts = []
    for n in payload.nodes:
        if n.type != "DEBT":
            continue
        fixed = [e.monthly_fixed_flow for e in payload.edges if e.target == n.id and e.monthly_fixed_flow is not None]
        minimum = n.min_payment if n.min_payment is not None else (sum(fixed) if fixed else n.balance * 0.02)
        debts.append(DebtItem(n.id, n.name, n.balance, n.apr / 100, minimum))
    minimums = sum(d.min_payment for d in debts if d.balance > 0)
    surplus = income - expenses - minimums
    contribution = max(0, surplus) * payload.investment_rate / 100
    initial = sum(n.balance for n in payload.nodes if n.type in ("CHECKING", "SAVINGS", "INVESTMENT")) - sum(d.balance for d in debts)
    result = {"status": "success", "metrics": {
        "initial_investment": initial, "monthly_contribution": contribution,
        "monthly_income": income, "monthly_expenses": expenses,
        "minimum_debt_payments": minimums, "monthly_surplus": surplus, "years": payload.years,
    }, "assumptions": [
        "Income and expenses remain constant; enter take-home income.",
        "Investments earn simulated returns; cash earns its account APR. Loans accrue their own APR.",
        "Uninvested surplus stays in cash. Deficits use cash, then investments, then borrowing at 12% APR.",
        "Wealth forecasts pay debt minimums; the debt tool compares allocating extra surplus.",
        "Fixed incoming debt connections set payments unless overridden. Other connections are visual routing only.",
        "Market parameters are illustrative fixed assumptions, not live market calibration.",
        "Debt payment defaults to 2% of starting principal when no fixed connection or override is provided.",
    ]}
    if payload.sim_type == "debt":
        result["assumptions"] = [
            "Income and living expenses remain constant; enter take-home monthly income.",
            "The payment budget comes from monthly cash flow, without liquidating existing assets.",
            "Minimums plus the chosen share of surplus form a fixed payment budget; freed payments roll into remaining loans.",
            "If cash flow cannot cover minimums, payments are reduced and unpaid balances keep accruing interest.",
            "A fixed incoming debt connection sets the payment unless overridden; otherwise 2% of starting principal is assumed.",
            "Loan APRs are fixed. Interest is charged monthly before payments. No fees or new purchases are modeled.",
        ]
        extra = contribution if surplus >= 0 else surplus
        result["debt"], result["debt_summary"] = {}, {}
        result["debt_labels"] = {d.id: d.name for d in debts if d.balance > 0}
        for strategy in ("avalanche", "snowball"):
            rows, _ = simulate_debt_waterfall(debts, extra, strategy, payload.years * 12)
            remaining = sum(rows[-1].get(d.id, 0) for d in debts)
            interest = sum(sum(row.get(d.id, 0) * d.apr / 12 for d in debts) for row in rows[:-1])
            result["debt"][strategy] = rows
            result["debt_summary"][strategy] = {
                "paid_off": remaining < 0.005, "months": rows[-1]["month"] if remaining < 0.005 else None,
                "remaining_balance": round(remaining, 2), "total_interest": round(interest, 2),
                "monthly_budget": max(0, minimums + extra),
            }
    else:
        forecast, baseline = project_household(payload.nodes, debts, income, expenses,
            payload.investment_rate, payload.inflation_rate, payload.years, payload.sim_type)
        result[payload.sim_type] = forecast
        result["metrics"]["no_growth_baseline"] = baseline
    return result
