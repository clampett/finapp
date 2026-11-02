import type { GraphData, GraphNode, NodeType } from './finance';
import { debtPayment, expenseAmount, totals, typeLabel } from './finance';
import { placeNewNode } from './graph-workspace';

export interface RecurringTransactionItem {
  id?: number;
  userId?: number;
  accountId?: number | null;
  accountName?: string | null;
  categoryId?: number | null;
  categoryName?: string | null;
  kind: 'income' | 'expense';
  description: string;
  amount: number;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';
  intervalCount: number;
  startDate: string;
  endDate?: string | null;
  nextDueDate: string;
  isActive: boolean;
  notes?: string;
}

export interface ScenarioIncomeSummary {
  totalMonthly: number;
  nodes: GraphNode[];
}

export interface ScenarioDebtSummary {
  totalBalance: number;
  totalMonthlyPayment: number;
  nodes: (GraphNode & { monthlyPayment: number })[];
}

export interface ScenarioBudgetComparison {
  plannedIncome: number;
  plannedTakeHome: number;
  plannedExpenses: number;
  plannedDebtPayments: number;
  plannedTotalCommitments: number;
  plannedSurplus: number;
  actualIncome: number;
  actualExpense: number;
  actualCashFlow: number;
  incomeVariance: number;
  expenseVariance: number;
  cashFlowVariance: number;
}

export function getScenarioSalary(graph?: GraphData | null): ScenarioIncomeSummary {
  if (!graph?.nodes?.length) {
    return { totalMonthly: 0, nodes: [] };
  }
  const nodes = graph.nodes.filter((n) => n.nodeType === 'INCOME' && !n.archived && !n.disabled);
  const totalMonthly = nodes.reduce((sum, n) => sum + Number(n.amountOrBalance || 0), 0);
  return { totalMonthly, nodes };
}

export function getScenarioDebts(graph?: GraphData | null): ScenarioDebtSummary {
  if (!graph?.nodes?.length) {
    return { totalBalance: 0, totalMonthlyPayment: 0, nodes: [] };
  }
  const rawDebtNodes = graph.nodes.filter(
    (n) => n.nodeType === 'DEBT' && !n.archived && !n.disabled,
  );
  const nodes = rawDebtNodes.map((node) => ({
    ...node,
    monthlyPayment: debtPayment(node, graph),
  }));
  const totalBalance = nodes.reduce((sum, n) => sum + Number(n.amountOrBalance || 0), 0);
  const totalMonthlyPayment = nodes.reduce((sum, n) => sum + Number(n.monthlyPayment || 0), 0);
  return { totalBalance, totalMonthlyPayment, nodes };
}

export function getScenarioBudgetComparison(
  graph: GraphData,
  actualIncome: number,
  actualExpense: number,
): ScenarioBudgetComparison {
  const t = totals(graph);
  const plannedIncome = t.income;
  const plannedTakeHome = t.takeHome;
  const plannedExpenses = t.expenses;
  const plannedDebtPayments = t.payments;
  const plannedTotalCommitments = plannedExpenses + plannedDebtPayments;
  const plannedSurplus = t.surplus;
  const actualCashFlow = actualIncome - actualExpense;

  return {
    plannedIncome,
    plannedTakeHome,
    plannedExpenses,
    plannedDebtPayments,
    plannedTotalCommitments,
    plannedSurplus,
    actualIncome,
    actualExpense,
    actualCashFlow,
    incomeVariance: actualIncome - plannedIncome,
    expenseVariance: plannedTotalCommitments - actualExpense, // positive = under budget
    cashFlowVariance: actualCashFlow - plannedSurplus,
  };
}

export function createSalaryRecurringTemplates(
  graph: GraphData,
  existingRecurring: RecurringTransactionItem[] = [],
  today = new Date().toISOString().split('T')[0],
): RecurringTransactionItem[] {
  const { nodes } = getScenarioSalary(graph);
  const newTemplates: RecurringTransactionItem[] = [];

  for (const node of nodes) {
    const alreadyExists = existingRecurring.some(
      (r) =>
        r.kind === 'income' &&
        (r.description.toLowerCase().includes(node.name.toLowerCase()) ||
          r.notes?.includes(`scenario income node #${node.id}`)),
    );
    if (!alreadyExists) {
      newTemplates.push({
        kind: 'income',
        accountName: 'Checking',
        description: `${node.name} Paycheck`,
        amount: Number(node.amountOrBalance),
        frequency: 'monthly',
        intervalCount: 1,
        startDate: today,
        nextDueDate: today,
        isActive: true,
        notes: `Imported from scenario income node #${node.id}`,
      });
    }
  }

  return newTemplates;
}

export function createDebtRecurringTemplates(
  graph: GraphData,
  existingRecurring: RecurringTransactionItem[] = [],
  today = new Date().toISOString().split('T')[0],
): RecurringTransactionItem[] {
  const { nodes } = getScenarioDebts(graph);
  const newTemplates: RecurringTransactionItem[] = [];

  for (const node of nodes) {
    if (node.monthlyPayment <= 0) continue;
    const alreadyExists = existingRecurring.some(
      (r) =>
        r.kind === 'expense' &&
        (r.description.toLowerCase().includes(node.name.toLowerCase()) ||
          r.accountName?.toLowerCase() === node.name.toLowerCase() ||
          r.notes?.includes(`scenario debt node #${node.id}`)),
    );
    if (!alreadyExists) {
      newTemplates.push({
        kind: 'expense',
        accountName: node.name,
        categoryName: 'Debt',
        description: `${node.name} Payment`,
        amount: Math.round(node.monthlyPayment * 100) / 100,
        frequency: 'monthly',
        intervalCount: 1,
        startDate: today,
        nextDueDate: today,
        isActive: true,
        notes: `Contractual monthly payment for scenario debt node #${node.id} (${node.interestRateApr}% APR)`,
      });
    }
  }

  return newTemplates;
}

export function syncScenarioTransactionToGraph(
  graph: GraphData,
  transaction: {
    kind: string;
    accountName?: string | null;
    description?: string;
    amount: number;
    categoryName?: string | null;
    isReversal?: boolean;
  },
): {
  updatedGraph: GraphData;
  matchedNode: GraphNode;
  newBalance: number;
  isNew?: boolean;
} | null {
  if (!graph || !Array.isArray(graph.nodes)) {
    return null;
  }
  if (!transaction.amount || Number(transaction.amount) <= 0) {
    return null;
  }
  const amount = Number(transaction.amount);
  const isIncome = transaction.kind === 'income';
  const isReversal = Boolean(transaction.isReversal);
  const desc = (transaction.description || '').trim();
  const descLower = desc.toLowerCase();
  const acct = (transaction.accountName || '').trim();
  const acctLower = acct.toLowerCase();
  const cat = (transaction.categoryName || '').trim();
  const catLower = cat.toLowerCase();

  // Find cash account node matching accountName if explicitly targeted
  let cashNode = graph.nodes.find(
    (n) =>
      !n.archived &&
      ['CHECKING', 'SAVINGS'].includes(n.nodeType) &&
      (n.name.trim().toLowerCase() === acctLower ||
        (acctLower === 'checking' && n.nodeType === 'CHECKING') ||
        (acctLower === 'savings' && n.nodeType === 'SAVINGS') ||
        (acctLower && n.name.toLowerCase().includes(acctLower)) ||
        (!acct && n.nodeType === 'CHECKING')),
  );

  // Fallback checking node for connecting flow routes in graph & cash flow
  const routingNode =
    cashNode ||
    graph.nodes.find(
      (n) =>
        !n.archived &&
        (n.nodeType === 'CHECKING' || n.name.toLowerCase().includes('checking')),
    );

  // 1. Debt check: Is this a payment to a known debt account, or reversing one?
  const isDebt =
    (!isIncome || isReversal) &&
    (catLower === 'debt' ||
      acctLower.includes('loan') ||
      acctLower.includes('card') ||
      descLower.includes('loan') ||
      descLower.includes('card'));

  const matchedDebt = isDebt
    ? graph.nodes.find(
        (n) =>
          n.nodeType === 'DEBT' &&
          !n.archived &&
          (n.name.trim().toLowerCase() === acctLower ||
            (descLower && n.name.trim().toLowerCase() === descLower) ||
            (descLower && descLower.includes(n.name.trim().toLowerCase())) ||
            (acctLower && acctLower.includes(n.name.trim().toLowerCase()))),
      )
    : graph.nodes.find(
        (n) =>
          n.nodeType === 'DEBT' &&
          !n.archived &&
          (n.name.trim().toLowerCase() === acctLower ||
            (descLower && n.name.trim().toLowerCase() === descLower)),
      );

  // If debt node matched and transaction is income without a reversal or separate description, debt accounts cannot accept income deposits
  if (matchedDebt && isIncome && !isReversal && (!desc || descLower === matchedDebt.name.toLowerCase())) {
    return null;
  }

  // Handle reversing a previous debt payment (restores debt balance and reimburses cash)
  if (matchedDebt && isReversal && isIncome) {
    const newBalance = matchedDebt.amountOrBalance + amount;
    let updatedNodes = graph.nodes.map((n) =>
      n.id === matchedDebt.id ? { ...n, amountOrBalance: newBalance } : n,
    );
    const activeCashNode = cashNode;
    if (activeCashNode && activeCashNode.id !== matchedDebt.id) {
      const newCashBalance = activeCashNode.amountOrBalance + amount;
      updatedNodes = updatedNodes.map((n) =>
        n.id === activeCashNode.id ? { ...n, amountOrBalance: newCashBalance } : n,
      );
    }
    return {
      updatedGraph: { ...graph, nodes: updatedNodes },
      matchedNode: matchedDebt,
      newBalance,
      isNew: false,
    };
  }

  // If existing DEBT node is paid down
  if (matchedDebt && !isIncome) {
    const newBalance = Math.max(0, matchedDebt.amountOrBalance - amount);
    let updatedNodes = graph.nodes.map((n) =>
      n.id === matchedDebt.id ? { ...n, amountOrBalance: newBalance } : n,
    );

    // If cash account was the specified transaction account, deduct payment from cash account
    const activeCashNode = cashNode;
    if (activeCashNode && activeCashNode.id !== matchedDebt.id) {
      const newCashBalance = Math.max(0, activeCashNode.amountOrBalance - amount);
      updatedNodes = updatedNodes.map((n) =>
        n.id === activeCashNode.id ? { ...n, amountOrBalance: newCashBalance } : n,
      );
    }

    // Ensure edge between routingNode and debt node exists with monthlyFixedFlow
    const newEdges = [...graph.edges];
    if (routingNode && routingNode.id !== matchedDebt.id) {
      const edgeIndex = newEdges.findIndex(
        (e) => e.sourceNodeId === routingNode.id && e.targetNodeId === matchedDebt.id,
      );
      if (edgeIndex >= 0) {
        newEdges[edgeIndex] = {
          ...newEdges[edgeIndex],
          monthlyFixedFlow: amount,
          percentageFlow: null,
        };
      } else {
        newEdges.push({
          id: `edge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          sourceNodeId: routingNode.id,
          targetNodeId: matchedDebt.id,
          monthlyFixedFlow: amount,
          percentageFlow: null,
        });
      }
    }

    return {
      updatedGraph: { ...graph, nodes: updatedNodes, edges: newEdges },
      matchedNode: matchedDebt,
      newBalance,
      isNew: false,
    };
  }

  // 2. Adjust cash account balance for single, non-recurring transactions (e.g. grocery trip, coffee, dining, freelance income)
  // If specific cashNode not matched yet, try broader matching among active nodes
  if (!cashNode && acct) {
    cashNode = graph.nodes.find(
      (n) =>
        !n.archived &&
        ['CHECKING', 'SAVINGS'].includes(n.nodeType) &&
        (n.name.toLowerCase().includes(acctLower) || acctLower.includes(n.name.toLowerCase())),
    );
  }

  // Fallback to any active CHECKING node, then any active SAVINGS node
  if (!cashNode) {
    cashNode =
      graph.nodes.find((n) => !n.archived && n.nodeType === 'CHECKING') ||
      graph.nodes.find((n) => !n.archived && n.nodeType === 'SAVINGS');
  }

  // If no cash node exists at all in the graph, create a CHECKING node so net worth reflects point-in-time transactions
  if (!cashNode) {
    const newId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const initialBalance = isIncome ? amount : 0;
    const createdNode: GraphNode = {
      id: newId,
      name: acct || 'Checking Account',
      nodeType: 'CHECKING',
      amountOrBalance: initialBalance,
      interestRateApr: 0,
      position: placeNewNode(graph.nodes, { x: 300, y: 150 }),
    };
    return {
      updatedGraph: { ...graph, nodes: [...graph.nodes, createdNode] },
      matchedNode: createdNode,
      newBalance: initialBalance,
      isNew: true,
    };
  }

  const delta = isIncome ? amount : -amount;
  const newBalance = Math.max(0, cashNode.amountOrBalance + delta);
  const updatedNodes = graph.nodes.map((n) =>
    n.id === cashNode.id ? { ...n, amountOrBalance: newBalance } : n,
  );
  return {
    updatedGraph: { ...graph, nodes: updatedNodes },
    matchedNode: cashNode,
    newBalance,
    isNew: false,
  };
}

/**
 * Automatically syncs active scenario flow nodes (INCOME, EXPENSE, DEBT) into recurring transactions.
 * Returns the updated recurring list and a boolean flag indicating if any addition or update was made.
 */
export function syncGraphNodesToRecurring(
  graph: GraphData,
  existingRecurring: RecurringTransactionItem[],
  today = new Date().toISOString().split('T')[0],
): { updatedRecurring: RecurringTransactionItem[]; hasChanges: boolean } {
  if (!graph?.nodes?.length) {
    return { updatedRecurring: existingRecurring, hasChanges: false };
  }

  const archivedNodeIds = new Set(graph.nodes.filter((n) => n.archived).map((n) => n.id));
  const activeNodes = graph.nodes.filter((n) => !n.archived);
  let changed = false;

  // Filter out recurring transactions that belong to archived nodes
  let updated = existingRecurring.filter((r) => {
    if (!r.notes) return true;
    for (const archivedId of archivedNodeIds) {
      if (r.notes.includes(`[node-id:${archivedId}]`)) {
        changed = true;
        return false;
      }
    }
    return true;
  });

  let nextId = Math.max(0, ...updated.map((r) => r.id || 0)) + 1;

  for (const node of activeNodes) {
    if (!['INCOME', 'EXPENSE', 'DEBT'].includes(node.nodeType)) continue;

    const isIncome = node.nodeType === 'INCOME';
    const isDebt = node.nodeType === 'DEBT';
    const expectedKind: 'income' | 'expense' = isIncome ? 'income' : 'expense';
    const expectedAmount = isDebt
      ? Math.round(debtPayment(node, graph) * 100) / 100
      : node.nodeType === 'EXPENSE'
        ? Math.round(expenseAmount(node, graph) * 100) / 100
        : Number(node.amountOrBalance);

    if (expectedAmount <= 0) continue;

    const expectedDesc = isDebt ? `${node.name} Payment` : node.name;

    const matchIndex = updated.findIndex(
      (r) =>
        r.notes?.includes(`[node-id:${node.id}]`) ||
        r.description.trim().toLowerCase() === node.name.trim().toLowerCase() ||
        (isDebt &&
          r.description.trim().toLowerCase() === `${node.name.trim().toLowerCase()} payment`) ||
        (isIncome &&
          r.description.trim().toLowerCase() === `${node.name.trim().toLowerCase()} paycheck`),
    );

    if (matchIndex >= 0) {
      const existing = updated[matchIndex];
      if (
        Number(existing.amount) !== expectedAmount ||
        existing.kind !== expectedKind ||
        !existing.notes?.includes(`[node-id:${node.id}]`)
      ) {
        updated[matchIndex] = {
          ...existing,
          description: existing.description || expectedDesc,
          amount: expectedAmount,
          kind: expectedKind,
          notes: `[node-id:${node.id}] Scenario ${typeLabel(node.nodeType)}: ${node.name}`,
        };
        changed = true;
      }
    } else {
      updated.push({
        id: nextId++,
        kind: expectedKind,
        accountName: isDebt ? node.name : 'Checking',
        categoryName: isDebt ? 'Debt' : isIncome ? 'Income' : 'Living Expenses',
        description: expectedDesc,
        amount: expectedAmount,
        frequency: 'monthly',
        intervalCount: 1,
        startDate: today,
        nextDueDate: today,
        isActive: true,
        notes: `[node-id:${node.id}] Scenario ${typeLabel(node.nodeType)}: ${node.name}`,
      });
      changed = true;
    }
  }

  return { updatedRecurring: updated, hasChanges: changed };
}

/**
 * When a user adds or edits a recurring transaction in Budgeting,
 * automatically updates or creates the corresponding node in the graph scenario.
 */
export function syncRecurringToGraphNode(
  graph: GraphData,
  recur: Partial<RecurringTransactionItem>,
): { updatedGraph: GraphData; affectedNode: GraphNode; isNew: boolean } {
  const desc = (recur.description || '').trim();
  const amount = Number(recur.amount || 0);
  const isIncome = recur.kind === 'income';
  const isDebt =
    recur.categoryName?.trim().toLowerCase() === 'debt' ||
    recur.accountName?.trim().toLowerCase().includes('loan') ||
    recur.accountName?.trim().toLowerCase().includes('card');

  const expectedType: NodeType = isIncome ? 'INCOME' : isDebt ? 'DEBT' : 'EXPENSE';

  // Check if a node with matching [node-id:...] in notes or matching name exists
  const existingNode = graph.nodes.find(
    (n) =>
      (recur.notes && recur.notes.includes(`[node-id:${n.id}]`)) ||
      (!n.archived &&
        (n.name.trim().toLowerCase() === desc.toLowerCase() ||
          (isDebt && `${n.name.trim().toLowerCase()} payment` === desc.toLowerCase()))),
  );

  if (existingNode) {
    const cleanName =
      desc.endsWith(' Payment') && isDebt ? desc.replace(/ Payment$/i, '') : desc;
    const updatedNodes = graph.nodes.map((n) =>
      n.id === existingNode.id
        ? {
            ...n,
            archived: false,
            name: cleanName,
            amountOrBalance: amount,
            nodeType: expectedType,
          }
        : n,
    );

    // Update edge flow if matching edge exists
    const updatedEdges = graph.edges.map((e) => {
      if (
        (expectedType === 'INCOME' && e.sourceNodeId === existingNode.id) ||
        ((expectedType === 'EXPENSE' || expectedType === 'DEBT') &&
          e.targetNodeId === existingNode.id)
      ) {
        return { ...e, monthlyFixedFlow: amount };
      }
      return e;
    });

    return {
      updatedGraph: { ...graph, nodes: updatedNodes, edges: updatedEdges },
      affectedNode: {
        ...existingNode,
        archived: false,
        name: cleanName,
        amountOrBalance: amount,
        nodeType: expectedType,
      },
      isNew: false,
    };
  }

  // Brand new node
  const newNodeId = `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const cleanName = desc.endsWith(' Payment') && isDebt ? desc.replace(/ Payment$/i, '') : desc;
  const initialPos = isIncome ? { x: 80, y: 100 } : isDebt ? { x: 500, y: 220 } : { x: 350, y: 220 };
  const newNode: GraphNode = {
    id: newNodeId,
    name: cleanName,
    nodeType: expectedType,
    amountOrBalance: amount,
    interestRateApr: isDebt ? 5 : 0,
    position: placeNewNode(graph.nodes, initialPos),
  };

  const newEdges = [...graph.edges];
  const checkingNode = graph.nodes.find(
    (n) => !n.archived && (n.nodeType === 'CHECKING' || n.name.toLowerCase().includes('checking')),
  );
  if (checkingNode) {
    const edgeId = `edge-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (expectedType === 'INCOME') {
      newEdges.push({
        id: edgeId,
        sourceNodeId: newNode.id,
        targetNodeId: checkingNode.id,
        monthlyFixedFlow: amount,
        percentageFlow: null,
      });
    } else {
      newEdges.push({
        id: edgeId,
        sourceNodeId: checkingNode.id,
        targetNodeId: newNode.id,
        monthlyFixedFlow: amount,
        percentageFlow: null,
      });
    }
  }

  return {
    updatedGraph: { ...graph, nodes: [...graph.nodes, newNode], edges: newEdges },
    affectedNode: newNode,
    isNew: true,
  };
}

/**
 * When a user deletes a recurring transaction in Budgeting that corresponds to a scenario node,
 * archives the node in the graph so they stay in sync.
 */
export function syncRecurringDeletionToGraph(
  graph: GraphData,
  deletedRecur: Partial<RecurringTransactionItem>,
): { updatedGraph: GraphData; removedNode: GraphNode } | null {
  const desc = (deletedRecur.description || '').trim().toLowerCase();

  const matchedNode = graph.nodes.find(
    (n) =>
      !n.archived &&
      ((deletedRecur.notes && deletedRecur.notes.includes(`[node-id:${n.id}]`)) ||
        n.name.trim().toLowerCase() === desc ||
        `${n.name.trim().toLowerCase()} payment` === desc),
  );

  if (!matchedNode) return null;

  const updatedNodes = graph.nodes.map((n) =>
    n.id === matchedNode.id ? { ...n, archived: true } : n,
  );

  return {
    updatedGraph: { ...graph, nodes: updatedNodes },
    removedNode: matchedNode,
  };
}

