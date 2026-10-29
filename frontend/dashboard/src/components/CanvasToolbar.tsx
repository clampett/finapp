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
  const toolBtnClass = "w-[34px] h-[34px] max-xs:w-[29px] max-xs:h-[32px] min-h-0 p-0 grid place-items-center border-0 rounded-[7px] bg-transparent text-[#a8bbd2] cursor-pointer leading-none transition-colors duration-150 hover:not-disabled:bg-[#2b3d52] hover:not-disabled:text-[#f0f7ff] aria-pressed:bg-[#29443f] aria-pressed:text-[#89e5c8] disabled:opacity-30 disabled:cursor-default focus-visible:outline-2 focus-visible:outline-[#9be5d0] focus-visible:outline-offset-2";
  const toolAccentBtnClass = "w-[34px] h-[34px] max-xs:w-[29px] max-xs:h-[32px] min-h-0 p-0 grid place-items-center border-0 rounded-[7px] bg-[#b6a3ef] text-[#1a1530] hover:not-disabled:bg-[#d0c1fb] hover:not-disabled:text-[#171024] cursor-pointer leading-none transition-colors duration-150 disabled:opacity-30 disabled:cursor-default focus-visible:outline-2 focus-visible:outline-[#9be5d0] focus-visible:outline-offset-2";

  return (
    <div className="flex items-center gap-0.75 p-1.25 bg-[#152031ed] border border-[#34485c] rounded-xl shadow-[0_8px_25px_#0005,inset_0_1px_#ffffff06] backdrop-blur-[18px] max-xs:flex-wrap max-xs:gap-px" role="toolbar" aria-label="Node canvas tools">
      <button
        className={toolBtnClass}
        aria-label="Undo last graph edit"
        title={`Undo · ${shortcuts.undo}`}
        disabled={!canUndo}
        onClick={onUndo}
      >
        <CanvasIcon name="undo" />
      </button>
      <button
        className={toolBtnClass}
        aria-label="Redo graph edit"
        title={`Redo · ${shortcuts.redo}`}
        disabled={!canRedo}
        onClick={onRedo}
      >
        <CanvasIcon name="redo" />
      </button>
      <span className="w-px h-4.75 mx-1 bg-[#35445a]" />
      {canvasAvailable && (
        <>
          <button
            className={toolBtnClass}
            aria-label="Select and move nodes"
            title="Select and move"
            aria-pressed={tool === 'select'}
            onClick={() => onToolChange('select')}
          >
            <CanvasIcon name="cursor" />
          </button>
          <button
            className={toolBtnClass}
            aria-label="Pan canvas"
            title="Pan canvas · hand tool"
            aria-pressed={tool === 'pan'}
            onClick={() => onToolChange('pan')}
          >
            <CanvasIcon name="pan" />
          </button>
          <button
            className={toolBtnClass}
            aria-label="Box select nodes"
            title="Box select · drag around nodes, then drag the selection"
            aria-pressed={tool === 'box'}
            onClick={() => onToolChange('box')}
          >
            <CanvasIcon name="box" />
          </button>
          <button
            className={toolBtnClass}
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
        className={toolAccentBtnClass}
        aria-label="Add node"
        title="Add node"
        onClick={onAdd}
      >
        <CanvasIcon name="add" />
      </button>
      <span className="w-px h-4.75 mx-1 bg-[#35445a]" />
      {canvasAvailable && (
        <>
          <button
            className={toolBtnClass}
            aria-label="Auto arrange nodes"
            title="Auto arrange"
            onClick={onArrange}
          >
            <CanvasIcon name="layout" />
          </button>
          <button
            className={toolBtnClass}
            aria-label="Toggle compact nodes"
            title={compact ? 'Roomy nodes' : 'Compact nodes'}
            aria-pressed={compact}
            onClick={onDensity}
          >
            <CanvasIcon name="density" />
          </button>
        </>
      )}
      <details className="relative group">
        <summary className="w-8.5 h-8.5 max-xs:w-7.25 max-xs:h-8 min-h-0 p-0 grid place-items-center border-0 rounded-[7px] bg-transparent text-[#a8bbd2] cursor-pointer leading-none transition-colors duration-150 hover:bg-[#2b3d52] hover:text-[#f0f7ff] group-open:bg-[#2b3d52] group-open:text-[#f0f7ff] list-none select-none [&::-webkit-details-marker]:hidden" aria-label="More canvas actions" title="More actions">
          <CanvasIcon name="more" />
        </summary>
        <div
          className="absolute top-[calc(100%+12px)] -right-1.25 w-55 p-1.5 border border-[#3c4d65] rounded-xl bg-float shadow-[0_18px_50px_#0009] z-20"
          onClick={(event) => event.currentTarget.closest('details')?.removeAttribute('open')}
        >
          <button className="flex items-center gap-3 p-[11px_12px] border-0 rounded-[7px] w-full bg-transparent text-left text-xs text-[#d3dfec] hover:bg-[#2b3c51] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#9be5d0] focus-visible:outline-offset-2" aria-label="Restore removed nodes" onClick={onRestore}>
            <CanvasIcon name="restore" />
            Restore nodes <span className="ml-auto text-[#8de3c8]">{removed}</span>
          </button>
          <button className="flex items-center gap-3 p-[11px_12px] border-0 rounded-[7px] w-full bg-transparent text-left text-xs text-[#d3dfec] hover:bg-[#2b3c51] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#9be5d0] focus-visible:outline-offset-2" aria-label="Import scenario" onClick={onImport}>
            <CanvasIcon name="import" />
            Import scenario
          </button>
          <button className="flex items-center gap-3 p-[11px_12px] border-0 rounded-[7px] w-full bg-transparent text-left text-xs text-[#d3dfec] hover:bg-[#2b3c51] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#9be5d0] focus-visible:outline-offset-2" aria-label="Export scenario" onClick={onExport}>
            <CanvasIcon name="export" />
            Export scenario
          </button>
          <button className="flex items-center gap-3 p-[11px_12px] border-0 rounded-[7px] w-full bg-transparent text-left text-xs text-[#d3dfec] hover:bg-[#2b3c51] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#9be5d0] focus-visible:outline-offset-2 disabled:opacity-30 disabled:cursor-not-allowed" aria-label="Reset scenario" onClick={onReset} disabled={!canReset}>
            <CanvasIcon name="reset" />
            Reset scenario
          </button>
        </div>
      </details>
    </div>
  );
}
