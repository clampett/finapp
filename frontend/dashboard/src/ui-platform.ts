import type { CanvasTool } from './graph-workspace';

export function canvasWheelAction(
  tool: CanvasTool,
  pinch: boolean,
  gestureActive: boolean,
): 'block' | 'pan' | 'zoom' {
  if (tool === 'connect' || gestureActive) return 'block';
  return tool === 'pan' && !pinch ? 'pan' : 'zoom';
}

export function platformShortcuts(platform: string) {
  const mac = /Mac|iPad|iPhone|iPod/i.test(platform);
  return {
    mac,
    undo: mac ? '⌘Z' : 'Ctrl+Z',
    redo: mac ? '⇧⌘Z' : 'Ctrl+Y',
    select: mac ? 'Shift/⌘-click' : 'Shift/Ctrl-click',
    remove: mac ? 'Delete / Fn+Delete' : 'Delete / Backspace',
  };
}

// Matched Command and Control consistently, while leaving native text-field
// shortcuts to the focused input through the workspace's editable-target guard.
export function historyShortcut(event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): 'undo' | 'redo' | null {
  if (event.altKey || !(event.ctrlKey || event.metaKey)) return null;
  const key = event.key.toLowerCase();
  return key === 'y' || (key === 'z' && event.shiftKey) ? 'redo' : key === 'z' ? 'undo' : null;
}

export const shortcuts = platformShortcuts(
  typeof navigator === 'undefined' ? '' : navigator.platform || navigator.userAgent,
);
