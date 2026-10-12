from fastapi import FastAPI
from pydantic import BaseModel
from typing import List
from collections import deque, defaultdict
from app.simulation import simulate_growth

app = FastAPI(title="Finapp Analytics & AI")

# 1. Define what a single account/node looks like
class NodeDTO(BaseModel):
    id: str
    name: str
    category: str  # e.g., "Income", "Checking", "Expense", "Debt", "Investment"
    balance: float = 0.0
    # Added fields for the Monte Carlo engine (with safe defaults)
    annual_return: float = 0.07
    annual_volatility: float = 0.15

# 2. Define the flow direction (e.g., Income -> Checking)
class EdgeDTO(BaseModel):
    source_id: str
    target_id: str

# 3. The main payload catching the entire graph from Java
class GraphDTO(BaseModel):
    nodes: List[NodeDTO]
    edges: List[EdgeDTO]

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/api/simulate")
def simulate_graph(graph_data: GraphDTO):
    # 1. Setup our sorting tools
    adj_list = defaultdict(list)
    in_degree = {node.id: 0 for node in graph_data.nodes}
    node_map = {node.id: node for node in graph_data.nodes} 
    
    # 2. Build the graph relationships
    for edge in graph_data.edges:
        adj_list[edge.source_id].append(edge.target_id)
        in_degree[edge.target_id] += 1
        
    # 3. Find our starting points (e.g., Income)
    queue = deque([node_id for node_id, degree in in_degree.items() if degree == 0])
    sorted_nodes = []
    
    # 4. Topological Sort
    while queue:
        current_id = queue.popleft()
        sorted_nodes.append(node_map[current_id])
        
        for neighbor_id in adj_list[current_id]:
            in_degree[neighbor_id] -= 1
            if in_degree[neighbor_id] == 0:
                queue.append(neighbor_id)
                
    if len(sorted_nodes) != len(graph_data.nodes):
        return {"error": "Circular cash flow detected! Check your graph connections."}
        
    # 5. SIMULATE THE CASH FLOW (The Hard Stop MVP)
    # Track the live balances in a dictionary as we move through the month
    live_balances = {node.id: node.balance for node in graph_data.nodes}

    for current_node in sorted_nodes:
        # Get all edges leaving this node
        outbound_edges = [edge for edge in graph_data.edges if edge.source_id == current_node.id]
        
        for edge in outbound_edges:
            target_node = node_map[edge.target_id]
            
            # INCOME: Pushes its total value into the next account (e.g., Checking)
            if current_node.category.lower() == "income":
                live_balances[target_node.id] += live_balances[current_node.id]
                
            # CHECKING: Pays the required cost of the target (Expense/Debt/Investment)
            elif current_node.category.lower() == "checking":
                cost = target_node.balance
                
                # THE HARD STOP
                if live_balances[current_node.id] - cost < 0:
                    shortfall = cost - live_balances[current_node.id]
                    return {
                        "error": f"Bankruptcy Error! '{current_node.name}' ran out of money trying to pay '{target_node.name}'. Shortfall: ${shortfall}"
                    }
                
                # Pay the expense
                live_balances[current_node.id] -= cost
                live_balances[target_node.id] += cost 

# 6. Apply Monte Carlo to the Investment Nodes
    projections = {}
    for node in sorted_nodes:
        if node.category.lower() == "investment":
            # The cash flow loop added this month's transfer into live_balances[node.id].
            # We subtract the starting balance to isolate the exact monthly contribution.
            starting_balance = node.balance
            monthly_contribution = live_balances[node.id] - node.balance

            # Pass the extracted numbers to Quinn's numpy logic
            result = simulate_growth(
                start_balance=starting_balance,
                monthly_contribution=monthly_contribution,
                annual_return=node.annual_return,
                annual_volatility=node.annual_volatility,
                years=30
            )
            projections[node.name] = result

    # If we made it through the whole graph without failing, return the final checking balance
    checking_nodes = [n for n in sorted_nodes if n.category.lower() == "checking"]
    final_checking_balance = live_balances[checking_nodes[0].id] if checking_nodes else 0.0

    return {
        "message": "Simulation complete!",
        "final_checking_balance": final_checking_balance,
        "projections": projections
    }

