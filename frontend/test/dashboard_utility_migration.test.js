const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DASHBOARD_SRC = path.resolve(ROOT_DIR, 'dashboard/src');

function readTsx(relativePath) {
  return fs.readFileSync(path.join(DASHBOARD_SRC, relativePath), 'utf8');
}

function findTsxFiles(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findTsxFiles(fullPath, fileList);
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

// ============================================================================
// FEATURE 9: Dashboard Core Layout & Nav Utility Migration (R1, R3)
// ============================================================================

test('F9-T1-1 (Coverage): App.tsx eliminates bespoke shell and sidebar classes', () => {
  const tsx = readTsx('App.tsx');
  const forbidden = [
    'className="app-shell"',
    'className="app-sidebar"',
    'className="brand"',
    'className="brand-mark"',
    'className="nav-caption"',
    'className="sidebar-bottom"',
    'className="app-header"',
    'className="workspace-heading"',
    'className="profile-switcher"',
  ];

  for (const cls of forbidden) {
    assert.ok(!tsx.includes(cls), `Bespoke class "${cls}" must be migrated to utilities in App.tsx`);
  }
});

test('F9-T1-2 (Coverage): App.tsx applies semantic utility tokens (bg-raised, bg-header, bg-active-bg, text-text)', () => {
  const tsx = readTsx('App.tsx');
  assert.match(tsx, /\bbg-(raised|surface)\b/, 'App.tsx sidebar must use bg-raised or bg-surface');
  assert.match(tsx, /\bbg-header\b/, 'App.tsx header must use bg-header');
  assert.match(tsx, /\btext-text\b/, 'App.tsx typography must use text-text');
  assert.match(tsx, /\bborder-border\b/, 'App.tsx structural borders must use border-border');
});

test('F9-T1-3 (Coverage): App.tsx active nav items apply active utility tokens (bg-active-bg, text-active-text, border-active-border)', () => {
  const tsx = readTsx('App.tsx');
  assert.match(tsx, /\bbg-active-bg\b/, 'Active nav item must use bg-active-bg');
  assert.match(tsx, /\btext-active-text\b/, 'Active nav item must use text-active-text');
  assert.match(tsx, /\bborder-active-border\b/, 'Active nav item must use border-active-border');
});

test('F9-T1-4 (Coverage): DashboardTab.tsx eliminates bespoke metric and tab classes', () => {
  const tsx = readTsx('DashboardTab.tsx');
  assert.doesNotMatch(tsx, /className=["']dashboard-tab["']/);
  assert.doesNotMatch(tsx, /className=["']metric-grid["']/);
  assert.doesNotMatch(tsx, /className=["']metric-card["']/);
});

test('F9-T1-5 (Coverage): OverviewComposition.tsx eliminates bespoke composition classes', () => {
  const tsx = readTsx('components/OverviewComposition.tsx');
  const forbidden = [
    'className="overview-composition"',
    'className="composition-heading"',
    'className="composition-tabs"',
    'className="composition-content"',
    'className="composition-visual"',
    'className="composition-details"',
    'className="composition-legend"',
  ];

  for (const cls of forbidden) {
    assert.ok(!tsx.includes(cls), `Bespoke class "${cls}" must be removed from OverviewComposition.tsx`);
  }
});

test('F9-T2-1 (Boundary): App.tsx view switching state preserves view keys ("overview", "graph", "cashflow", "budgeting", "investing")', () => {
  const tsx = readTsx('App.tsx');
  assert.match(tsx, /'overview'/);
  assert.match(tsx, /'graph'/);
  assert.match(tsx, /'cashflow'/);
  assert.match(tsx, /'budgeting'/);
  assert.match(tsx, /'investing'/);
});

test('F9-T2-2 (Boundary): App.tsx back link points to root "/" home', () => {
  const tsx = readTsx('App.tsx');
  assert.match(tsx, /href=["']\/["']/);
});

test('F9-T2-3 (Boundary): App.tsx brand circle uses FinApp teal brand utility (bg-brand or text-brand)', () => {
  const tsx = readTsx('App.tsx');
  assert.match(tsx, /\bbg-brand\b|\btext-brand\b|#00c9b7/, 'App.tsx brand circle must use brand token');
});

test('F9-T2-4 (Boundary): DashboardTab.tsx uses grid utilities with gap and card borders', () => {
  const tsx = readTsx('DashboardTab.tsx');
  assert.match(tsx, /\bgrid\b/);
  assert.match(tsx, /\bgap-/);
  assert.match(tsx, /\bbg-surface\b/);
});

test('F9-T2-5 (Boundary): OverviewComposition.tsx preserves interactive slice selection dynamic highlight', () => {
  const tsx = readTsx('components/OverviewComposition.tsx');
  assert.match(tsx, /highlighted|selectedCategory/);
});

// ============================================================================
// FEATURE 10: Dashboard Canvas & Editor Utility Migration (R1, R2, R3)
// ============================================================================

test('F10-T1-1 (Coverage): Canvas.tsx eliminates bespoke UI wrapper classes', () => {
  const tsx = readTsx('components/Canvas.tsx');
  const forbidden = [
    'className="canvas-selection-status"',
    'className="canvas-editor-panel"',
    'className="canvas-feedback"',
    'className="canvas-empty"',
    'className="canvas-controls"',
  ];

  for (const cls of forbidden) {
    assert.ok(!tsx.includes(cls), `Bespoke UI class "${cls}" must be removed from Canvas.tsx`);
  }
});

test('F10-T1-2 (Coverage): Canvas.tsx preserves D3 SVG element and class hooks (canvas-node, canvas-edge, is-selected)', () => {
  const tsx = readTsx('components/Canvas.tsx');
  assert.match(tsx, /'canvas-node'/);
  assert.match(tsx, /'canvas-edge'/);
  assert.match(tsx, /'node-port/);
  assert.match(tsx, /'connector-preview'/);
  assert.match(tsx, /'is-selected'/);
  assert.match(tsx, /'edge-selected'/);
});

test('F10-T1-3 (Coverage): Canvas.tsx preserves dynamic connection mode and expanded state hooks (is-linking, connect-mode, expanded utilities)', () => {
  const tsx = readTsx('components/Canvas.tsx');
  assert.match(tsx, /is-linking/, 'Canvas.tsx must toggle is-linking on host element');
  assert.match(tsx, /connect-mode/, 'Canvas.tsx must retain connect-mode dynamic class');
  assert.match(tsx, /expanded\s*\?/, 'Canvas.tsx must handle expanded state with utilities');
});

test('F10-T1-4 (Coverage): CanvasToolbar.tsx eliminates bespoke tool dock classes', () => {
  const tsx = readTsx('components/CanvasToolbar.tsx');
  assert.doesNotMatch(tsx, /className=["']canvas-tool-dock["']/);
  assert.doesNotMatch(tsx, /className=["']canvas-tool-divider["']/);
  assert.doesNotMatch(tsx, /className=["']canvas-tool-accent["']/);
  assert.doesNotMatch(tsx, /className=["']canvas-menu-items["']/);
});

test('F10-T1-5 (Coverage): AccountEditor.tsx & ConnectionEditor.tsx eliminate bespoke inspector classes', () => {
  const acct = readTsx('components/AccountEditor.tsx');
  const conn = readTsx('components/ConnectionEditor.tsx');

  assert.doesNotMatch(acct, /className=["']inspector["']/);
  assert.doesNotMatch(acct, /className=["']editor-form["']/);
  assert.doesNotMatch(conn, /className=["']inspector["']/);
  assert.doesNotMatch(conn, /className=["']connection-inspector["']/);
});

test('F10-T2-1 (Boundary): Canvas.tsx host element retains canvas-host class for radial background', () => {
  const tsx = readTsx('components/Canvas.tsx');
  assert.match(tsx, /canvas-host/, 'Host element must keep canvas-host class for retained background pattern');
});

test('F10-T2-2 (Boundary): CanvasToolbar.tsx buttons preserve aria-pressed and tool selection', () => {
  const tsx = readTsx('components/CanvasToolbar.tsx');
  assert.match(tsx, /aria-pressed=/);
  assert.match(tsx, /disabled=/);
});

test('F10-T2-3 (Boundary): BudgetControls.tsx eliminates bespoke budget-panel classes', () => {
  const tsx = readTsx('components/BudgetControls.tsx');
  assert.doesNotMatch(tsx, /className=["']budget-content["']/);
  assert.doesNotMatch(tsx, /className=["']budget-inputs["']/);
  assert.doesNotMatch(tsx, /className=["']budget-reconciliation["']/);
});

test('F10-T2-4 (Boundary): graphs.tsx eliminates bespoke workspace-content and scenario-layout classes', () => {
  const tsx = readTsx('graphs.tsx');
  assert.doesNotMatch(tsx, /className=["']workspace-content["']/);
  assert.doesNotMatch(tsx, /className=["']scenario-layout["']/);
  assert.doesNotMatch(tsx, /className=["']scenario-main["']/);
  assert.doesNotMatch(tsx, /className=["']account-table-wrap["']/);
});

test('F10-T2-5 (Boundary): CanvasIcon.tsx pure SVG component does not introduce bespoke classes', () => {
  const tsx = readTsx('components/CanvasIcon.tsx');
  assert.doesNotMatch(tsx, /className=["'][a-z]+-[a-z]+["']/);
});

// ============================================================================
// FEATURE 11: Dashboard Complex Modals Utility Migration (R1, R3)
// ============================================================================

test('F11-T1-1 (Coverage): SimulationModal.tsx eliminates bespoke modal and dialog classes', () => {
  const tsx = readTsx('SimulationModal.tsx');
  const forbidden = [
    'className="modal-backdrop"',
    'className="simulation-dialog"',
    'className="simulation-lab"',
    'className="modal-header"',
    'className="modal-footer"',
    'className="simulation-body"',
    'className="simulation-main"',
    'className="simulation-sidebar"',
    'className="chart-toolbar"',
    'className="market-source-card"',
    'className="market-settings"',
    'className="strategy-switch"',
    'className="advanced-assumptions"',
  ];

  for (const cls of forbidden) {
    assert.ok(!tsx.includes(cls), `Bespoke class "${cls}" must be removed from SimulationModal.tsx`);
  }
});

test('F11-T1-2 (Coverage): ForecastChart.tsx eliminates bespoke forecast-plot classes', () => {
  const tsx = readTsx('simulation/ForecastChart.tsx');
  assert.doesNotMatch(tsx, /className=["']forecast-plot["']/);
  assert.doesNotMatch(tsx, /className=["']forecast-tools["']/);
  assert.doesNotMatch(tsx, /className=["']forecast-chart-surface["']/);
  assert.doesNotMatch(tsx, /className=["']forecast-plot-note["']/);
  assert.doesNotMatch(tsx, /className=["']legend-band["']/);
});

test('F11-T1-3 (Coverage): ForecastInsights.tsx eliminates bespoke outcome and audit classes', () => {
  const tsx = readTsx('simulation/ForecastInsights.tsx');
  assert.doesNotMatch(tsx, /className=["']outcome-card-grid["']/);
  assert.doesNotMatch(tsx, /className=["']outcome-card["']/);
  assert.doesNotMatch(tsx, /className=["']distribution-card["']/);
  assert.doesNotMatch(tsx, /className=["']annual-audit["']/);
  assert.doesNotMatch(tsx, /className=["']audit-toolbar["']/);
});

test('F11-T1-4 (Coverage): SimulationGuide.tsx eliminates bespoke simulation-guide class', () => {
  const tsx = readTsx('simulation/SimulationGuide.tsx');
  assert.doesNotMatch(tsx, /className=["']simulation-guide["']/);
});

test('F11-T1-5 (Coverage): Investing.tsx eliminates bespoke investing layout classes', () => {
  const tsx = readTsx('components/Investing.tsx');
  assert.doesNotMatch(tsx, /className=["']investing-intro["']/);
  assert.doesNotMatch(tsx, /className=["']investing-form["']/);
  assert.doesNotMatch(tsx, /className=["']stock-chips["']/);
  assert.doesNotMatch(tsx, /className=["']stock-chip["']/);
  assert.doesNotMatch(tsx, /className=["']investing-note["']/);
});

test('F11-T2-1 (Boundary): SimulationModal.tsx modal backdrop uses fixed inset-0 z-50 flex utilities', () => {
  const tsx = readTsx('SimulationModal.tsx');
  assert.match(tsx, /\bfixed\b/);
  assert.match(tsx, /\binset-0\b/);
  assert.match(tsx, /\bz-(40|50|60)\b|\bz-\[.+\]/);
});

test('F11-T2-2 (Boundary): SimulationModal.tsx dialog container uses bg-surface or bg-raised and rounded utilities', () => {
  const tsx = readTsx('SimulationModal.tsx');
  assert.match(tsx, /\bbg-(surface|raised)\b/);
  assert.match(tsx, /\brounded-(xl|2xl|lg)\b/);
});

test('F11-T2-3 (Boundary): ForecastChart.tsx ResponsiveContainer wrapper maintains explicit height/sizing', () => {
  const tsx = readTsx('simulation/ForecastChart.tsx');
  assert.match(tsx, /ResponsiveContainer/);
  assert.match(tsx, /\bw-full\b|\bh-\[?\d+px\]?|\bh-full\b/);
});

test('F11-T2-4 (Boundary): ForecastInsights.tsx distribution pills use semantic status colors (text-mint, text-coral)', () => {
  const tsx = readTsx('simulation/ForecastInsights.tsx');
  assert.match(tsx, /text-mint|text-coral|text-blue/);
});

test('F11-T2-5 (Boundary): BudgetingTab.tsx preserves form interaction inputs and async action buttons', () => {
  const tsx = readTsx('BudgetingTab.tsx');
  assert.match(tsx, /activeSubTab/);
  assert.match(tsx, /button/i);
});

// ============================================================================
// FEATURE 14: Dynamic States & Parity Across Dashboard TSX (R3)
// ============================================================================

test('F14-T1-1 (Coverage): Value indicators across Dashboard components use text-coral for negative and text-mint for positive', () => {
  const files = ['DashboardTab.tsx', 'components/BudgetControls.tsx', 'components/OverviewComposition.tsx'];
  for (const file of files) {
    const tsx = readTsx(file);
    const hasMintOrPositive = tsx.includes('text-mint') || tsx.includes('positive');
    const hasCoralOrNegative = tsx.includes('text-coral') || tsx.includes('negative');
    assert.ok(hasMintOrPositive, `${file} must format positive numbers with mint/positive`);
    assert.ok(hasCoralOrNegative, `${file} must format negative numbers with coral/negative`);
  }
});

test('F14-T1-2 (Coverage): Reusable button utility styles apply hover and disabled transitions', () => {
  const tsx = readTsx('components/CanvasToolbar.tsx');
  assert.match(tsx, /hover:|\bdisabled:/);
});

test('F14-T1-3 (Coverage): All 18 TSX files are present in dashboard/src', () => {
  const tsxFiles = findTsxFiles(DASHBOARD_SRC);
  assert.equal(tsxFiles.length, 18, `Expected exactly 18 TSX files in dashboard/src, found ${tsxFiles.length}`);
});

test('F14-T1-4 (Coverage): No TSX file contains legacy CSS module or inline style sheets imports', () => {
  const tsxFiles = findTsxFiles(DASHBOARD_SRC);
  for (const file of tsxFiles) {
    const content = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(content, /import\s+['"].*\.module\.css['"]/, `${path.basename(file)} imports CSS module`);
  }
});

test('F14-T1-5 (Coverage): NumberField.tsx encapsulates number input without breaking class conventions', () => {
  const tsx = readTsx('components/NumberField.tsx');
  assert.match(tsx, /type=["']number["']/);
});

test('F14-T2-1 (Boundary): Canvas.tsx marquee selection rect uses SVG presentation attributes', () => {
  const tsx = readTsx('components/Canvas.tsx');
  assert.match(tsx, /'canvas-marquee'/);
});

test('F14-T2-2 (Boundary): Canvas.tsx port circles toggle connection source and target classes', () => {
  const tsx = readTsx('components/Canvas.tsx');
  assert.match(tsx, /connection-source/);
  assert.match(tsx, /connection-target/);
});

test('F14-T2-3 (Boundary): SimulationModal.tsx strategy switch buttons toggle selected state', () => {
  const tsx = readTsx('SimulationModal.tsx');
  assert.match(tsx, /selected|strategy/);
});

test('F14-T2-4 (Boundary): ForecastChart.tsx metric tabs toggle active timeframe or view mode', () => {
  const tsx = readTsx('simulation/ForecastChart.tsx');
  assert.match(tsx, /selected|metric/);
});

test('F14-T2-5 (Boundary): Investing.tsx stock chips toggle active ticker selection', () => {
  const tsx = readTsx('components/Investing.tsx');
  assert.match(tsx, /selectedTicker|ticker/);
});

// ============================================================================
// TIER 3 & TIER 4: Combinations and Realistic Application Scenarios
// ============================================================================

test('F9-F10-T3-1 (Combination): Active view switching and canvas persistence contract in App.tsx', () => {
  const tsx = readTsx('App.tsx');
  assert.match(tsx, /view={view}/);
  assert.match(tsx, /<ArchetypeGraph/);
});

test('F9-F11-T3-2 (Combination): Simulation modal launcher triggers from archetype graph and renders simulation lab', () => {
  const graphTsx = readTsx('graphs.tsx');
  assert.match(graphTsx, /<SimulationModal/);
});

test('F10-F11-T3-3 (Combination): D3 node portfolio data wires into Monte Carlo simulation props', () => {
  const graphTsx = readTsx('graphs.tsx');
  assert.match(graphTsx, /graphData=\{simulationGraph\}/);
});

test('F9-F10-T3-4 (Combination): Surface hierarchy token consistency between App sidebar, header, and canvas dock', () => {
  const appTsx = readTsx('App.tsx');
  const toolbarTsx = readTsx('components/CanvasToolbar.tsx');
  assert.match(appTsx, /\bbg-(surface|raised|header)\b/);
  assert.match(toolbarTsx, /\bbg-(float|surface|raised)\b|#172334/);
});

test('F10-T4-1 (Workload Scenario): Dashboard Canvas Node Selection & Linking state machine contracts', () => {
  const tsx = readTsx('components/Canvas.tsx');
  assert.match(tsx, /is-linking/);
  assert.match(tsx, /is-selected/);
  assert.match(tsx, /edge-selected/);
  assert.match(tsx, /connector-preview/);
  assert.match(tsx, /node-port/);
});

test('F11-T4-2 (Workload Scenario): Dashboard Simulation Modal execution and forecast display lifecycle', () => {
  const modalTsx = readTsx('SimulationModal.tsx');
  assert.match(modalTsx, /<ForecastChart/);
  assert.match(modalTsx, /<ForecastInsights/);
  assert.match(modalTsx, /onClose/);
});
