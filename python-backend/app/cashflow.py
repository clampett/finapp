"""Shared monthly budget rules, separated from stochastic investment returns."""

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class SavingPlan:
    investment_fixed: float = 0
    savings_fixed: float = 0
    investment_percent: float = 0
    savings_percent: float = 0

    def allocate(self, available, investment_rate):
        # Funded only affordable transfers, with fixed commitments first and
        # percentage routes based on the surplus left after those fixed transfers.
        available = np.maximum(0.0, available)
        fixed = self.investment_fixed + self.savings_fixed
        fixed_scale = np.minimum(1.0, available / fixed) if fixed else np.zeros_like(available)
        planned_investment = self.investment_fixed * fixed_scale
        planned_savings = self.savings_fixed * fixed_scale
        remainder = np.maximum(0.0, available - planned_investment - planned_savings)
        percentage = self.investment_percent + self.savings_percent
        percent_scale = 1 / max(100.0, percentage)
        planned_investment += remainder * self.investment_percent * percent_scale
        planned_savings += remainder * self.savings_percent * percent_scale
        unassigned = np.maximum(0.0, available - planned_investment - planned_savings)
        extra_investment = unassigned * investment_rate / 100
        return {
            "planned_investment": planned_investment,
            "planned_savings": planned_savings,
            "unassigned": unassigned,
            "investment": planned_investment + extra_investment,
            "cash": planned_savings + unassigned - extra_investment,
        }


def saving_plan(nodes, edges):
    # Counted new allocations from income/checking only; salary-to-checking and
    # account balances were not counted again as additional income or expenses.
    by_id = {n.id: n for n in nodes}
    amounts = dict(
        investment_fixed=0.0, savings_fixed=0.0, investment_percent=0.0, savings_percent=0.0
    )
    for edge in edges:
        source, target = by_id[edge.source], by_id[edge.target]
        if source.type not in ("INCOME", "CHECKING") or target.type not in (
            "INVESTMENT",
            "SAVINGS",
        ):
            continue
        prefix = "investment" if target.type == "INVESTMENT" else "savings"
        if edge.monthly_fixed_flow is not None:
            amounts[f"{prefix}_fixed"] += edge.monthly_fixed_flow
        else:
            amounts[f"{prefix}_percent"] += edge.percentage_flow
    return SavingPlan(**amounts)


def monthly_budget(income, expenses, debt_payment, income_basis, tax_rate, plan, investment_rate):
    # Applied an explicit effective tax estimate only to gross pay. Transfers
    # between owned accounts reduced unassigned money, not household net worth.
    taxes = income * tax_rate if income_basis == "gross" else 0.0
    take_home = income - taxes
    surplus = take_home - expenses - debt_payment
    allocated = plan.allocate(surplus, investment_rate)
    return {
        "monthly_income": income,
        "monthly_taxes": taxes,
        "take_home_income": take_home,
        "monthly_expenses": expenses,
        "minimum_debt_payments": debt_payment,
        "monthly_surplus": surplus,
        "planned_investment": float(allocated["planned_investment"]),
        "planned_savings": float(allocated["planned_savings"]),
        "unassigned_surplus": float(allocated["unassigned"]) if surplus > 0 else surplus,
        "monthly_contribution": float(allocated["investment"]),
        "monthly_cash_saving": float(allocated["cash"]),
        "income_basis": income_basis,
        "effective_tax_rate": tax_rate if income_basis == "gross" else 0,
    }
