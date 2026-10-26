export type CanvasIconName =
  | 'pan'
  | 'box'
  | 'undo'
  | 'redo'
  | 'add'
  | 'connect'
  | 'layout'
  | 'density'
  | 'restore'
  | 'import'
  | 'export'
  | 'reset'
  | 'more'
  | 'expand'
  | 'collapse'
  | 'plus'
  | 'minus'
  | 'fit'
  | 'cursor'
  | 'close';
const paths: Record<CanvasIconName, string> = {
  pan: 'M8 12V5a2 2 0 0 1 4 0v7M12 11V4a2 2 0 0 1 4 0v8M16 11V7a2 2 0 0 1 4 0v8c0 4-3 7-7 7h-1c-2 0-3-1-4-3l-4-6a2 2 0 0 1 3-2l1 1',
  box: 'M3 7V3h4M11 3h2M17 3h4v4M21 11v2M21 17v4h-4M13 21h-2M7 21H3v-4M3 13v-2',
  undo: 'M9 5 4 10l5 5M4 10h10a6 6 0 0 1 0 12',
  redo: 'm15 5 5 5-5 5m5-5H10a6 6 0 0 0 0 12',
  add: 'M12 5v14M5 12h14',
  connect: 'M5 5h4v4H5zM15 15h4v4h-4zM9 7h4a4 4 0 0 1 4 4v4',
  layout: 'M3 4h6v6H3zM15 4h6v6h-6zM9 15h6v6H9zM6 10v2h12v-2M12 12v3',
  density: 'M4 4h16v6H4zM4 14h16v6H4zM8 7h8M8 17h8',
  restore: 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6',
  import: 'M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5',
  export: 'M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5',
  reset: 'M4 10a8 8 0 1 1 1 8M4 4v6h6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  expand: 'M9 3H3v6M15 3h6v6M3 15v6h6M21 15v6h-6',
  collapse: 'M3 9h6V3M21 9h-6V3M3 15h6v6M21 15h-6v6',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  fit: 'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M8 8h8v8H8z',
  cursor: 'm5 3 14 10-7 1-3 7z',
  close: 'm6 6 12 12M18 6 6 18',
};
export function CanvasIcon({ name }: { name: CanvasIconName }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === 'more' ? 3.5 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
