import { AccountEditor } from '../components/AccountEditor';
import { Canvas } from '../components/Canvas';
import { CanvasToolbar } from '../components/CanvasToolbar';
import { CanvasIcon } from '../components/CanvasIcon';
import { ConnectionEditor } from '../components/ConnectionEditor';
import { downloadJson, typeLabel } from '../finance';
import type { useGraphEditing } from './useGraphEditing';
import type { useScenarioGraph } from './useScenarioGraph';

export function WorkspaceCanvas({
  scenario,
  editor,
  search,
  scopeIds,
  userId,
}: {
  scenario: ReturnType<typeof useScenarioGraph>;
  editor: ReturnType<typeof useGraphEditing>;
  search: string;
  scopeIds: string[];
  userId: number;
}) {
  const { graph, live, original, history, error, update } = scenario;
  const {
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
  } = editor;
  // Kept the editing toolbar and inspectors with the canvas that renders them.
  const toolbar = (
    <CanvasToolbar
      canvasAvailable
      canUndo={!!history.past.length}
      canRedo={!!history.future.length}
      compact={compact}
      connecting={connecting}
      tool={tool}
      onToolChange={(value) => {
        setTool(value);
        setSelected(null);
        setEditingEdge(null);
        setPendingEdge(null);
        setShowArchive(false);
      }}
      removed={graph.nodes.filter((node) => node.archived).length}
      canReset={!!original}
      onUndo={() => travel('undo')}
      onRedo={() => travel('redo')}
      onDensity={() => setCompact(!compact)}
      onConnect={() => {
        setTool(connecting ? 'select' : 'connect');
        setSelected(null);
        setEditingEdge(null);
        setPendingEdge(null);
        setShowArchive(false);
      }}
      onArrange={arrange}
      onRestore={() => {
        setSelectionIds([]);
        setEdgeSelectionIds([]);
        setShowArchive(!showArchive);
        setSelected(null);
        setEditingEdge(null);
        setPendingEdge(null);
      }}
      onImport={() => importRef.current?.click()}
      onExport={() => downloadJson(graph, `finapp-scenario-${userId}.json`)}
      onReset={reset}
      onAdd={() => {
        setSelectionIds([]);
        setEdgeSelectionIds([]);
        setTool('select');
        setShowArchive(false);
        setEditingEdge(null);
        setPendingEdge(null);
        add();
      }}
    />
  );
  const archivePanel = (
    <>
      {showArchive && (
        <section className="border border-(--ui-border-33445b) rounded-xl bg-(--ui-surface-121d2c) p-5 mb-5">
          <div className="flex items-center justify-between gap-3 mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:m-0">
            <h3>Recently removed nodes</h3>
            <button
              className="inline-flex items-center justify-center border border-(--ui-border-303c54) bg-(--ui-surface-1a2538) hover:bg-(--ui-surface-hover-25354e) text-(--ui-text-d6e2f5) rounded-[7px] w-8 h-8 shrink-0 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-(--ui-border-a78bfa) focus-visible:outline-offset-2"
              aria-label="Close restore panel"
              title="Close"
              onClick={() => setShowArchive(false)}
            >
              <CanvasIcon name="close" />
            </button>
          </div>
          <p className="text-xs leading-[1.7] text-(--ui-text-99aec6) my-2">
            Restored nodes recover their saved values, position, and connections when both endpoints
            are active.
          </p>
          {graph.nodes
            .filter((node) => node.archived)
            .map((node) => (
              <div
                key={node.id}
                className="flex justify-between gap-3 items-center py-2 border-b border-(--ui-border-243247) last:border-b-0 text-xs text-text"
              >
                <span>
                  {node.name} · {typeLabel(node.nodeType)}
                </span>
                <button
                  className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3 py-1.5 text-xs font-medium cursor-pointer bg-(--ui-surface-20293a) text-text border border-(--ui-border-37445c) hover:bg-(--ui-surface-hover-28354c) transition-colors"
                  onClick={() =>
                    update({
                      ...graph,
                      nodes: graph.nodes.map((item) =>
                        item.id === node.id ? { ...item, archived: false } : item,
                      ),
                    })
                  }
                >
                  Restore {node.name}
                </button>
              </div>
            ))}
          {!graph.nodes.some((node) => node.archived) && (
            <p className="text-xs leading-[1.7] text-(--ui-text-99aec6) my-2">
              No removed nodes. Undo also restores recent edits.
            </p>
          )}
        </section>
      )}
    </>
  );
  const inspector = (
    <>
      {selected && (
        <AccountEditor
          key={selected.id}
          node={selected}
          graph={live}
          onClose={() => setSelected(null)}
          onEditRoute={selectEdge}
          onSave={(n) => {
            update({
              ...graph,
              nodes: graph.nodes.some((a) => a.id === n.id)
                ? graph.nodes.map((a) => (a.id === n.id ? n : a))
                : [...graph.nodes, n],
            });
            setSelected(null);
          }}
          onDelete={() => {
            update({
              ...graph,
              nodes: graph.nodes.map((node) =>
                node.id === selected.id ? { ...node, archived: true } : node,
              ),
            });
            setSelected(null);
            setSelectionIds([]);
            setEdgeSelectionIds([]);
          }}
        />
      )}
      {activeEdge && (
        <ConnectionEditor
          key={activeEdge.id}
          graph={live}
          edge={activeEdge}
          isNew={!!pendingEdge}
          onClose={() => {
            setEditingEdge(null);
            setPendingEdge(null);
          }}
          onSave={(edge) => {
            update({
              ...graph,
              edges: graph.edges.some((item) => item.id === edge.id)
                ? graph.edges.map((item) => (item.id === edge.id ? edge : item))
                : [...graph.edges, edge],
            });
            setEditingEdge(null);
            setPendingEdge(null);
          }}
          onDelete={() => {
            if (!pendingEdge)
              update({ ...graph, edges: graph.edges.filter((edge) => edge.id !== editingEdge) });
            setEditingEdge(null);
            setEdgeSelectionIds([]);
            setPendingEdge(null);
          }}
        />
      )}
    </>
  );
  return (
    <Canvas
      toolbar={toolbar}
      feedback={error}
      panel={showArchive ? archivePanel : selected || activeEdge ? inspector : null}
      connecting={connecting}
      tool={tool}
      selectionIds={selectionIds}
      edgeSelectionIds={edgeSelectionIds}
      onGroupSelect={selectGroup}
      onConnect={connectNodes}
      onViewportCenter={reportCenter}
      graph={live}
      selected={selected?.id}
      search={search}
      onSelect={selectAccount}
      scopeIds={scopeIds}
      onToggleScope={toggleSelection}
      onEdgeSelect={selectEdge}
      compact={compact}
      onMove={(positions) => {
        setSelectionIds(Object.keys(positions));
        setEdgeSelectionIds([]);
        setSelected(null);
        setEditingEdge(null);
        update({
          ...graph,
          nodes: graph.nodes.map((node) =>
            positions[node.id] ? { ...node, position: positions[node.id] } : node,
          ),
        });
      }}
    />
  );
}
