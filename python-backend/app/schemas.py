from pydantic import BaseModel


class NodeIn(BaseModel):
    id: int
    name: str
    nodeType: str  # INCOME, CHECKING, SAVINGS, EXPENSE, ASSET, DEPOSIT, DEBT, INVESTMENT
    amountOrBalance: float
    interestRateApr: float = 0


class EdgeIn(BaseModel):
    id: int | None = None
    sourceNodeId: int
    targetNodeId: int
    monthlyFixedFlow: float | None = None
    percentageFlow: float | None = None


class ProfileIn(BaseModel):
    age: int | None = None
    annualIncome: float | None = None
    riskTolerance: str = "MEDIUM"  # LOW, MEDIUM, HIGH
    targetRetireAge: int | None = None


class SimulationRequest(BaseModel):
    profile: ProfileIn
    nodes: list[NodeIn]
    edges: list[EdgeIn]
    years: int = 30
    iterations: int = 1000


class SimulationResult(BaseModel):
    p10NetWorth: float
    p50NetWorth: float
    p90NetWorth: float
    aiRecommendation: str
