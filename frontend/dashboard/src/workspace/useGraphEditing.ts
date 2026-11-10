import { useCallback, useEffect, useRef, useState } from 'react';
import type { GraphEdge, GraphNode, SimulationType, View } from '../finance';
import { placeNewNode, recordGraph, removeSelection, travelGraph } from '../graph-workspace';
import type { CanvasTool } from '../graph-workspace';
import { historyShortcut } from '../ui-platform';
import type { useScenarioGraph } from './useScenarioGraph';

export function useGraphEditing(
  scenario: ReturnType<typeof useScenarioGraph>,
  view: View,
  simType: SimulationType | null,
) {
  const { graph, live, original, update, setHistory, setError, setStorageStatus } = scenario;
  const [editingEdge, setEditingEdge] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [tool, setTool] = useState<CanvasTool>('select');
  const connecting = tool === 'connect';
  const [selectionIds, setSelectionIds] = useState<string[]>([]);
  const [edgeSelectionIds, setEdgeSelectionIds] = useState<string[]>([]);
  const [pendingEdge, setPendingEdge] = useState<GraphEdge | null>(null);
  const [compact, setCompact] = useState(false);
  const spawnCenter = useRef({ x: 345, y: 0 });
  const reportCenter = useCallback((center: { x: number; y: number }) => {
    spawnCenter.current = center;
  }, []);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const travel = useCallback(
    (direction: 'undo' | 'redo') => {
      setHistory((current) => travelGraph(current, direction));
      setSelected(null);
      setEditingEdge(null);
      setPendingEdge(null);
      setSelectionIds([]);
      setEdgeSelectionIds([]);
      setError('');
    },
    [setHistory, setError],
  );
  // Handled workspace shortcuts outside editable fields and the simulation dialog.
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        simType ||
        event.altKey ||
        (event.target instanceof Element &&
          event.target.closest('input,textarea,select,[contenteditable="true"]'))
      )
        return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && view === 'graph') {
        if (selectionIds.length || edgeSelectionIds.length) {
          event.preventDefault();
          setHistory((current) =>
            recordGraph(current, removeSelection(current.present, selectionIds, edgeSelectionIds)),
          );
          setSelected(null);
          setEditingEdge(null);
          setPendingEdge(null);
          setSelectionIds([]);
          setEdgeSelectionIds([]);
          setStorageStatus('Selection removed. Undo to restore.');
        }
        return;
      }
      const action = historyShortcut(event);
      if (action) {
        event.preventDefault();
        travel(action);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [travel, simType, view, selectionIds, edgeSelectionIds, setHistory, setStorageStatus]);
  const selectAccount = useCallback((n: GraphNode) => {
    setSelectionIds([n.id]);
    setEdgeSelectionIds([]);
    setSelected(n);
    setEditingEdge(null);
    setPendingEdge(null);
    setShowArchive(false);
  }, []);
  const selectEdge = useCallback((id: string, additive = false) => {
    setEdgeSelectionIds((ids) =>
      additive ? (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]) : [id],
    );
    if (!additive) setSelectionIds([]);
    setEditingEdge(additive ? null : id);
    setPendingEdge(null);
    setShowArchive(false);
    setSelected(null);
  }, []);
  const toggleSelection = useCallback((id: string) => {
    setSelectionIds((ids) =>
      ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
    );
    setSelected(null);
    setEditingEdge(null);
    setPendingEdge(null);
  }, []);
  const selectGroup = useCallback((ids: string[]) => {
    setSelectionIds(ids);
    setEdgeSelectionIds([]);
    setSelected(null);
    setEditingEdge(null);
    setPendingEdge(null);
    setShowArchive(false);
    setTool('select');
  }, []);
  const add = () =>
    setSelected({
      id: crypto.randomUUID(),
      name: '',
      nodeType: 'CHECKING',
      amountOrBalance: 0,
      interestRateApr: 0,
      position: placeNewNode(live.nodes, spawnCenter.current),
    });
  const reset = () => {
    if (
      original &&
      window.confirm('Restore the original scenario? This replaces your edits in this browser.')
    ) {
      update(structuredClone(original));
      setSelected(null);
      setSelectionIds([]);
      setEdgeSelectionIds([]);
      setEditingEdge(null);
      setPendingEdge(null);
    }
  };
  const arrange = () => {
    const columns = [['INCOME'], ['CHECKING', 'SAVINGS'], ['EXPENSE', 'DEBT', 'INVESTMENT']];
    update({
      ...graph,
      nodes: graph.nodes.map((node) => {
        if (node.archived) return node;
        const col = columns.findIndex((types) => types.includes(node.nodeType));
        const group = live.nodes.filter((item) => columns[col].includes(item.nodeType));
        return {
          ...node,
          position: {
            x: col * 345,
            y: group.findIndex((item) => item.id === node.id) * 130 - (group.length - 1) * 65,
          },
        };
      }),
    });
  };
  // Prepared a draft route on drop; committed its amount only after Apply so
  // a cancelled gesture could not silently change the household budget.
  const connectNodes = useCallback((source: string, target: string) => {
    if (source === target) return;
    setSelected(null);
    setShowArchive(false);
    setEditingEdge(null);
    setTool('select');
    setPendingEdge({
      id: crypto.randomUUID(),
      sourceNodeId: source,
      targetNodeId: target,
      monthlyFixedFlow: 0,
      percentageFlow: null,
    });
  }, []);
  // Preferred a pending connection over the saved edge while the inspector was open.
  const activeEdge = pendingEdge ?? live.edges.find((edge) => edge.id === editingEdge);
  return {
    editingEdge,
    setEditingEdge,
    showArchive,
    setShowArchive,
    tool,
    setTool,
    connecting,
    selectionIds,
    setSelectionIds,
    edgeSelectionIds,
    setEdgeSelectionIds,
    pendingEdge,
    setPendingEdge,
    compact,
    setCompact,
    reportCenter,
    selected,
    setSelected,
    importRef,
    travel,
    selectAccount,
    selectEdge,
    toggleSelection,
    selectGroup,
    add,
    reset,
    arrange,
    connectNodes,
    activeEdge,
  };
}
