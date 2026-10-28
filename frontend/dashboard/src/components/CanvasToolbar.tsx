import { CanvasIcon } from './CanvasIcon';
import type { CanvasTool } from '../graph-workspace';
import { shortcuts } from '../ui-platform';

export function CanvasToolbar({
  canUndo,
  canRedo,
  compact,
  connecting,
  removed,
  canReset,
  onUndo,
  onRedo,
  onDensity,
  onConnect,
  onArrange,
  onRestore,
  onImport,
  onExport,
  onReset,
  onAdd,
  canvasAvailable = true,
  tool,
  onToolChange,
}: {
  canUndo: boolean;
  canRedo: boolean;
  compact: boolean;
  connecting: boolean;
  removed: number;
  canReset: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onDensity: () => void;
  onConnect: () => void;
  onArrange: () => void;
  onRestore: () => void;
  onImport: () => void;
  onExport: () => void;
  onReset: () => void;
  onAdd: () => void;
  canvasAvailable?: boolean;
  tool: CanvasTool;
  onToolChange: (tool: CanvasTool) => void;
}) {
  return (
    <div className="canvas-tool-dock" role="toolbar" aria-label="Node canvas tools">
      <button
        className="canvas-tool"
        aria-label="Undo last graph edit"
        title={`Undo · ${shortcuts.undo}`}
        disabled={!canUndo}
        onClick={onUndo}
      >
        <CanvasIcon name="undo" />
      </button>
      <button
        className="canvas-tool"
        aria-label="Redo graph edit"
        title={`Redo · ${shortcuts.redo}`}
        disabled={!canRedo}
        onClick={onRedo}
      >
        <CanvasIcon name="redo" />
      </button>
      <span className="canvas-tool-divider" />
      {canvasAvailable && (
        <>
          <button
            className="canvas-tool"
            aria-label="Select and move nodes"
            title="Select and move"
            aria-pressed={tool === 'select'}
            onClick={() => onToolChange('select')}
          >
            <CanvasIcon name="cursor" />
          </button>
          <button
            className="canvas-tool"
            aria-label="Pan canvas"
            title="Pan canvas · hand tool"
            aria-pressed={tool === 'pan'}
            onClick={() => onToolChange('pan')}
          >
            <CanvasIcon name="pan" />
          </button>
          <button
            className="canvas-tool"
            aria-label="Box select nodes"
            title="Box select · drag around nodes, then drag the selection"
            aria-pressed={tool === 'box'}
            onClick={() => onToolChange('box')}
          >
            <CanvasIcon name="box" />
          </button>
          <button
            className="canvas-tool"
            aria-label="Connect nodes"
            title="Connect · drag a node's right handle, or click source then destination"
            aria-pressed={connecting}
            onClick={onConnect}
          >
            <CanvasIcon name="connect" />
          </button>
        </>
      )}
      <button
        className="canvas-tool canvas-tool-accent"
        aria-label="Add node"
        title="Add node"
        onClick={onAdd}
      >
        <CanvasIcon name="add" />
      </button>
      <span className="canvas-tool-divider" />
      {canvasAvailable && (
        <>
          <button
            className="canvas-tool"
            aria-label="Auto arrange nodes"
            title="Auto arrange"
            onClick={onArrange}
          >
            <CanvasIcon name="layout" />
          </button>
          <button
            className="canvas-tool"
            aria-label="Toggle compact nodes"
            title={compact ? 'Roomy nodes' : 'Compact nodes'}
            aria-pressed={compact}
            onClick={onDensity}
          >
            <CanvasIcon name="density" />
          </button>
        </>
      )}
      <details className="canvas-more-menu">
        <summary className="canvas-tool" aria-label="More canvas actions" title="More actions">
          <CanvasIcon name="more" />
        </summary>
        <div
          className="canvas-menu-items"
          onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}
        >
          <button aria-label="Restore removed nodes" onClick={onRestore}>
            <CanvasIcon name="restore" />
            Restore nodes <span>{removed}</span>
          </button>
          <button aria-label="Import scenario" onClick={onImport}>
            <CanvasIcon name="import" />
            Import scenario
          </button>
          <button aria-label="Export scenario" onClick={onExport}>
            <CanvasIcon name="export" />
            Export scenario
          </button>
          <button aria-label="Reset scenario" onClick={onReset} disabled={!canReset}>
            <CanvasIcon name="reset" />
            Reset scenario
          </button>
        </div>
      </details>
    </div>
  );
}
