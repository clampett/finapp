from pydantic import BaseModel
from typing import List

class EdgeDTO(BaseModel):
    source: str
    target: str

class NodeDTO(BaseModel):
    id: str
    type: str
    balance: float = 0.0
    income_stream: float = 0.0

class GraphDTO(BaseModel):
    nodes: List[NodeDTO]
    edges: List[EdgeDTO]