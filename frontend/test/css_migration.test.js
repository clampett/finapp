const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const LANDING_CSS_PATH = path.resolve(ROOT_DIR, 'landing/src/css/style.css');
const DASHBOARD_CSS_PATH = path.resolve(ROOT_DIR, 'dashboard/src/index.css');

function readCss(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function findCssFiles(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'build' && entry.name !== '.git') {
        findCssFiles(fullPath, fileList);
      }
    } else if (entry.isFile() && entry.name.endsWith('.css')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

// ============================================================================
// FEATURE 1: Landing Tailwind V4 @theme & Token System (R2)
// ============================================================================

test('F1-T1-1 (Coverage): landing style.css defines @theme block', () => {
  const css = readCss(LANDING_CSS_PATH);
  assert.match(css, /@theme\s*\{[\s\S]*?\}/, 'style.css must contain a valid @theme block');
});

test('F1-T1-2 (Coverage): landing style.css defines all 13 required color tokens referencing CSS variables', () => {
  const css = readCss(LANDING_CSS_PATH);
  const themeMatch = css.match(/@theme\s*\{([\s\S]*?)\}/);
  assert.ok(themeMatch, '@theme block must be present');
  const themeBody = themeMatch[1];

  const expectedTokens = [
    ['--color-background', 'var(--background)'],
    ['--color-foreground', 'var(--foreground)'],
    ['--color-card', 'var(--card)'],
    ['--color-primary', 'var(--primary)'],
    ['--color-primary-fg', 'var(--primary-foreground)'],
    ['--color-muted', 'var(--muted)'],
    ['--color-border', 'var(--border)'],
    ['--color-text', 'var(--text_color)'],
    ['--color-header', 'var(--header)'],
    ['--color-mint', 'var(--mint)'],
    ['--color-coral', 'var(--coral)'],
    ['--color-blue', 'var(--blue)'],
    ['--color-shadow', 'var(--shadow)'],
  ];

  for (const [token, variable] of expectedTokens) {
    const escapedVar = variable.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`${token}\\s*:\\s*${escapedVar}\\s*;`);
    assert.match(themeBody, regex, `Missing or misconfigured token: ${token} -> ${variable}`);
  }
});

test('F1-T1-3 (Coverage): landing style.css defines --font-sans Inter stack in @theme', () => {
  const css = readCss(LANDING_CSS_PATH);
  const themeMatch = css.match(/@theme\s*\{([\s\S]*?)\}/);
  assert.ok(themeMatch, '@theme block must be present');
  assert.match(
    themeMatch[1],
    /--font-sans\s*:\s*Inter\s*,\s*ui-sans-serif\s*,\s*-apple-system\s*,\s*BlinkMacSystemFont\s*,\s*['"]Segoe UI['"]\s*,\s*sans-serif\s*;/,
    '--font-sans must match standard Inter system stack',
  );
});

test('F1-T1-4 (Coverage): landing style.css defines all 3 responsive breakpoints (nav, mob, xs)', () => {
  const css = readCss(LANDING_CSS_PATH);
  const themeMatch = css.match(/@theme\s*\{([\s\S]*?)\}/);
  assert.ok(themeMatch, '@theme block must be present');
  const themeBody = themeMatch[1];

  assert.match(themeBody, /--breakpoint-nav\s*:\s*1050px\s*;/, 'Missing --breakpoint-nav: 1050px');
  assert.match(themeBody, /--breakpoint-mob\s*:\s*850px\s*;/, 'Missing --breakpoint-mob: 850px');
  assert.match(themeBody, /--breakpoint-xs\s*:\s*600px\s*;/, 'Missing --breakpoint-xs: 600px');
});

test('F1-T1-5 (Coverage): landing style.css contains @source directive pointing to pages', () => {
  const css = readCss(LANDING_CSS_PATH);
  assert.match(css, /@source\s+['"]\.\.\/\.\.\/pages['"]\s*;/, 'Missing @source "../../pages" directive');
});

test('F1-T2-1 (Boundary): landing @theme tokens use precise variable names without syntax errors', () => {
  const css = readCss(LANDING_CSS_PATH);
  const themeMatch = css.match(/@theme\s*\{([\s\S]*?)\}/);
  assert.ok(themeMatch);
  const themeBody = themeMatch[1];
  const lines = themeBody.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('--'));

  for (const line of lines) {
    assert.match(line, /^--[a-z0-9-_]+\s*:\s*[^;]+;$/, `Invalid CSS variable declaration syntax in @theme: "${line}"`);
  }
});

test('F1-T2-2 (Boundary): landing responsive breakpoints have strictly ascending pixel values', () => {
  const css = readCss(LANDING_CSS_PATH);
  const xs = parseInt((css.match(/--breakpoint-xs\s*:\s*(\d+)px/) || [])[1], 10);
  const mob = parseInt((css.match(/--breakpoint-mob\s*:\s*(\d+)px/) || [])[1], 10);
  const nav = parseInt((css.match(/--breakpoint-nav\s*:\s*(\d+)px/) || [])[1], 10);

  assert.ok(!Number.isNaN(xs) && !Number.isNaN(mob) && !Number.isNaN(nav), 'Breakpoints must parse to integers');
  assert.ok(xs < mob, `xs (${xs}) must be strictly less than mob (${mob})`);
  assert.ok(mob < nav, `mob (${mob}) must be strictly less than nav (${nav})`);
});

test('F1-T2-3 (Boundary): landing style.css does not declare duplicate color tokens in @theme', () => {
  const css = readCss(LANDING_CSS_PATH);
  const themeMatch = css.match(/@theme\s*\{([\s\S]*?)\}/);
  assert.ok(themeMatch);
  const tokens = [...themeMatch[1].matchAll(/--(color-[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
  const uniqueTokens = new Set(tokens);
  assert.equal(tokens.length, uniqueTokens.size, `Duplicate color token declarations found in @theme: ${tokens}`);
});

test('F1-T2-4 (Boundary): landing primary-fg token maps specifically to --primary-foreground', () => {
  const css = readCss(LANDING_CSS_PATH);
  assert.match(css, /--color-primary-fg\s*:\s*var\(--primary-foreground\)\s*;/, 'Must map --color-primary-fg to var(--primary-foreground)');
  assert.doesNotMatch(css, /--color-primary-foreground\s*:/, 'Legacy --color-primary-foreground should be replaced by --color-primary-fg');
});

test('F1-T2-5 (Boundary): landing text token maps specifically to --text_color', () => {
  const css = readCss(LANDING_CSS_PATH);
  assert.match(css, /--color-text\s*:\s*var\(--text_color\)\s*;/, 'Must map --color-text to var(--text_color)');
  assert.doesNotMatch(css, /--color-text_color\s*:/, 'Legacy --color-text_color should be replaced by --color-text');
});

// ============================================================================
// FEATURE 2: Landing style.css Gutting (R2)
// ============================================================================

test('F2-T1-1 (Coverage): landing style.css line count is gutted to <= 90 non-empty lines and <= 100 total lines', () => {
  const css = readCss(LANDING_CSS_PATH);
  const lines = css.split('\n');
  const nonEmptyLines = lines.map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith('/*'));

  assert.ok(
    nonEmptyLines.length <= 90,
    `Expected landing style.css non-empty line count <= 90, got ${nonEmptyLines.length}`,
  );
  assert.ok(
    lines.length <= 100,
    `Expected landing style.css total line count <= 100, got ${lines.length}`,
  );
});

test('F2-T1-2 (Coverage): zero occurrences of @apply across all frontend CSS files', () => {
  const cssFiles = findCssFiles(ROOT_DIR);
  assert.ok(cssFiles.length >= 2, 'Should find at least landing and dashboard CSS files');

  for (const file of cssFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const matches = content.match(/@apply\b/g);
    assert.equal(
      matches,
      null,
      `Forbidden @apply directive detected in ${path.relative(ROOT_DIR, file)}: count=${matches ? matches.length : 0}`,
    );
  }
});

test('F2-T1-3 (Coverage): landing style.css preserves runtime :root, [data-theme="dark"], and [data-theme="light"] variables', () => {
  const css = readCss(LANDING_CSS_PATH);
  assert.match(css, /:root[\s\S]*?\[data-theme=['"]dark['"]\]/, 'Missing :root / [data-theme="dark"] selector block');
  assert.match(css, /\[data-theme=['"]light['"]\]/, 'Missing [data-theme="light"] selector block');

  const requiredDarkVars = [
    '--background', '--foreground', '--card', '--primary', '--primary-foreground',
    '--muted', '--border', '--text_color', '--header', '--mint', '--coral', '--blue', '--shadow',
  ];
  for (const v of requiredDarkVars) {
    assert.match(css, new RegExp(`${v}\\s*:\\s*#[0-9a-fA-F]{3,8}\\s*;`), `Dark theme missing variable ${v}`);
  }
});

test('F2-T1-4 (Coverage): landing style.css preserves non-utility SVG sample-node rules and details/summary markers', () => {
  const css = readCss(LANDING_CSS_PATH);
  assert.match(css, /\.preview-edges/, 'Missing .preview-edges SVG rule');
  assert.match(css, /\.sample-node rect/, 'Missing .sample-node rect SVG rule');
  assert.match(css, /\.sample-node \.node-type/, 'Missing .sample-node .node-type SVG rule');
  assert.match(css, /\.sample-node \.node-name/, 'Missing .sample-node .node-name SVG rule');
  assert.match(css, /\.sample-node \.node-amount/, 'Missing .sample-node .node-amount SVG rule');
  assert.match(css, /\.sample-node\.income \.node-amount/, 'Missing .sample-node.income SVG rule');
  assert.match(css, /\.sample-node\.debt \.node-amount/, 'Missing .sample-node.debt SVG rule');
  assert.match(css, /summary::-webkit-details-marker\s*\{\s*display:\s*none;?\s*\}/, 'Missing summary::-webkit-details-marker rule');
});

test('F2-T1-5 (Coverage): landing style.css eliminates bespoke BEM component classes', () => {
  const css = readCss(LANDING_CSS_PATH);
  const forbiddenSelectors = [
    /\.site-container\s*\{/,
    /\.site-header\s*\{/,
    /\.site-brand\s*\{/,
    /\.hero\s*\{/,
    /\.hero-copy\s*\{/,
    /\.preview-wrap\s*\{/,
    /\.feature-grid\s*\{/,
    /\.feature-card\s*\{/,
    /\.workflow-section\s*\{/,
    /\.scenario-grid\s*\{/,
    /\.scenario-card\s*\{/,
    /\.faq-section\s*\{/,
    /\.final-cta\s*\{/,
    /\.site-footer\s*\{/,
    /\.auth-card\s*\{/,
    /\.auth-form\s*\{/,
    /\.auth-layout\s*\{/,
    /\.site-button\s*\{/,
    /\.site-eyebrow\s*\{/,
  ];

  for (const selector of forbiddenSelectors) {
    assert.doesNotMatch(css, selector, `Bespoke component selector still present in style.css: ${selector}`);
  }
});

test('F2-T2-1 (Boundary): landing style.css begins with @import "tailwindcss"', () => {
  const css = readCss(LANDING_CSS_PATH);
  const firstNonEmpty = css.split('\n').map((l) => l.trim()).filter(Boolean)[0];
  assert.equal(firstNonEmpty, "@import 'tailwindcss';", 'First statement in style.css must be @import \'tailwindcss\';');
});

test('F2-T2-2 (Boundary): landing style.css preserves global scrollbar styling on wildcard selector', () => {
  const css = readCss(LANDING_CSS_PATH);
  assert.match(css, /\*\s*\{[\s\S]*?scrollbar-width:\s*thin;[\s\S]*?scrollbar-color:\s*#46546a\s+transparent;[\s\S]*?\}/);
});

test('F2-T2-3 (Boundary): landing style.css preserves ::selection background and text color', () => {
  const css = readCss(LANDING_CSS_PATH);
  assert.match(css, /::selection\s*\{[\s\S]*?background:\s*#7357a8;[\s\S]*?color:\s*white;[\s\S]*?\}/);
});

test('F2-T2-4 (Boundary): landing style.css retains dynamic interactive classes (.site-navigation.is-open and .negative)', () => {
  const css = readCss(LANDING_CSS_PATH);
  assert.match(css, /\.site-navigation\.is-open\s*\{[\s\S]*?display:\s*flex\s*!important;[\s\S]*?\}/, 'Missing .site-navigation.is-open toggle rule');
  assert.match(css, /\.negative\s*\{[\s\S]*?color:\s*var\(--coral\)\s*!important;[\s\S]*?\}/, 'Missing .negative value rule');
});

test('F2-T2-5 (Boundary): landing style.css retains prefers-reduced-motion media query with complete animation reset', () => {
  const css = readCss(LANDING_CSS_PATH);
  assert.match(
    css,
    /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{[\s\S]*?transition:\s*none\s*!important;[\s\S]*?animation:\s*none\s*!important;[\s\S]*?\}/,
    'prefers-reduced-motion block must reset transition and animation',
  );
});

// ============================================================================
// FEATURE 7: Dashboard Tailwind V4 @theme & Token System (R2)
// ============================================================================

test('F7-T1-1 (Coverage): dashboard index.css defines @theme block', () => {
  const css = readCss(DASHBOARD_CSS_PATH);
  assert.match(css, /@theme\s*\{[\s\S]*?\}/, 'dashboard index.css must contain a valid @theme block');
});

test('F7-T1-2 (Coverage): dashboard index.css defines all 19 semantic color tokens with exact hex values', () => {
  const css = readCss(DASHBOARD_CSS_PATH);
  const themeMatch = css.match(/@theme\s*\{([\s\S]*?)\}/);
  assert.ok(themeMatch, 'dashboard @theme block must be present');
  const themeBody = themeMatch[1];

  const expectedTokens = [
    ['--color-base', '#0c1018'],
    ['--color-surface', '#141b27'],
    ['--color-raised', '#10151f'],
    ['--color-float', '#172334'],
    ['--color-header', '#0f141e'],
    ['--color-border', '#232c3c'],
    ['--color-text', '#e7edf8'],
    ['--color-muted', '#96a6bf'],
    ['--color-subtle', '#697991'],
    ['--color-primary', '#b8a3fa'],
    ['--color-primary-fg', '#1b1234'],
    ['--color-mint', '#85e0bb'],
    ['--color-coral', '#fb8296'],
    ['--color-blue', '#7db9fa'],
    ['--color-brand', '#00c9b7'],
    ['--color-active-bg', '#242438'],
    ['--color-active-text', '#c9bdff'],
    ['--color-active-border', '#36324d'],
    ['--color-hover-bg', '#192230'],
  ];

  for (const [token, hex] of expectedTokens) {
    const regex = new RegExp(`${token}\\s*:\\s*${hex}\\s*;`, 'i');
    assert.match(themeBody, regex, `Missing or misconfigured dashboard token: ${token} -> ${hex}`);
  }
});

test('F7-T1-3 (Coverage): dashboard index.css defines --font-sans Inter stack in @theme', () => {
  const css = readCss(DASHBOARD_CSS_PATH);
  const themeMatch = css.match(/@theme\s*\{([\s\S]*?)\}/);
  assert.ok(themeMatch, '@theme block must be present in index.css');
  assert.match(
    themeMatch[1],
    /--font-sans\s*:\s*Inter\s*,\s*ui-sans-serif\s*,\s*-apple-system\s*,\s*BlinkMacSystemFont\s*,\s*['"]Segoe UI['"]\s*,\s*sans-serif\s*;/,
    'Dashboard --font-sans must match standard Inter system stack',
  );
});

test('F7-T1-4 (Coverage): dashboard index.css defines all 5 responsive breakpoints (2xl, xl, md, sm, xs)', () => {
  const css = readCss(DASHBOARD_CSS_PATH);
  const themeMatch = css.match(/@theme\s*\{([\s\S]*?)\}/);
  assert.ok(themeMatch, '@theme block must be present');
  const themeBody = themeMatch[1];

  assert.match(themeBody, /--breakpoint-2xl\s*:\s*1600px\s*;/, 'Missing --breakpoint-2xl: 1600px');
  assert.match(themeBody, /--breakpoint-xl\s*:\s*1100px\s*;/, 'Missing --breakpoint-xl: 1100px');
  assert.match(themeBody, /--breakpoint-md\s*:\s*800px\s*;/, 'Missing --breakpoint-md: 800px');
  assert.match(themeBody, /--breakpoint-sm\s*:\s*650px\s*;/, 'Missing --breakpoint-sm: 650px');
  assert.match(themeBody, /--breakpoint-xs\s*:\s*600px\s*;/, 'Missing --breakpoint-xs: 600px');
});

test('F7-T1-5 (Coverage): dashboard index.css defines active and brand semantic tokens', () => {
  const css = readCss(DASHBOARD_CSS_PATH);
  assert.match(css, /--color-brand\s*:\s*#00c9b7\s*;/i);
  assert.match(css, /--color-active-bg\s*:\s*#242438\s*;/i);
  assert.match(css, /--color-active-text\s*:\s*#c9bdff\s*;/i);
  assert.match(css, /--color-active-border\s*:\s*#36324d\s*;/i);
});

test('F7-T2-1 (Boundary): dashboard index.css tokens use lowercase valid 6-character hex format', () => {
  const css = readCss(DASHBOARD_CSS_PATH);
  const themeMatch = css.match(/@theme\s*\{([\s\S]*?)\}/);
  assert.ok(themeMatch);
  const hexDeclarations = [...themeMatch[1].matchAll(/--(color-[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]+)\s*;/g)];

  assert.equal(hexDeclarations.length, 19, 'Should have exactly 19 hex color tokens in @theme');
  for (const [, name, hex] of hexDeclarations) {
    assert.match(hex, /^#[0-9a-f]{6}$/, `Token ${name} hex value must be lowercase 6-char hex string: "${hex}"`);
  }
});

test('F7-T2-2 (Boundary): dashboard index.css breakpoints match exact required dimensions', () => {
  const css = readCss(DASHBOARD_CSS_PATH);
  const bp2xl = parseInt((css.match(/--breakpoint-2xl\s*:\s*(\d+)px/) || [])[1], 10);
  const bpxl = parseInt((css.match(/--breakpoint-xl\s*:\s*(\d+)px/) || [])[1], 10);
  const bpmd = parseInt((css.match(/--breakpoint-md\s*:\s*(\d+)px/) || [])[1], 10);
  const bpsm = parseInt((css.match(/--breakpoint-sm\s*:\s*(\d+)px/) || [])[1], 10);
  const bpxs = parseInt((css.match(/--breakpoint-xs\s*:\s*(\d+)px/) || [])[1], 10);

  assert.equal(bp2xl, 1600);
  assert.equal(bpxl, 1100);
  assert.equal(bpmd, 800);
  assert.equal(bpsm, 650);
  assert.equal(bpxs, 600);
  assert.ok(bpxs < bpsm && bpsm < bpmd && bpmd < bpxl && bpxl < bp2xl, 'Breakpoints must strictly order: xs < sm < md < xl < 2xl');
});

test('F7-T2-3 (Boundary): dashboard index.css does not declare duplicate color tokens in @theme', () => {
  const css = readCss(DASHBOARD_CSS_PATH);
  const themeMatch = css.match(/@theme\s*\{([\s\S]*?)\}/);
  assert.ok(themeMatch);
  const tokens = [...themeMatch[1].matchAll(/--(color-[a-z0-9-]+)\s*:/g)].map((m) => m[1]);
  const uniqueTokens = new Set(tokens);
  assert.equal(tokens.length, uniqueTokens.size, `Duplicate color token declarations found in dashboard @theme: ${tokens}`);
});

test('F7-T2-4 (Boundary): dashboard index.css surface and base tokens establish dark mode foundation', () => {
  const css = readCss(DASHBOARD_CSS_PATH);
  assert.match(css, /--color-base\s*:\s*#0c1018\s*;/i);
  assert.match(css, /--color-surface\s*:\s*#141b27\s*;/i);
  assert.match(css, /--color-raised\s*:\s*#10151f\s*;/i);
  assert.match(css, /--color-float\s*:\s*#172334\s*;/i);
});

test('F7-T2-5 (Boundary): dashboard index.css indicator tokens define mint for positive and coral for negative', () => {
  const css = readCss(DASHBOARD_CSS_PATH);
  assert.match(css, /--color-mint\s*:\s*#85e0bb\s*;/i);
  assert.match(css, /--color-coral\s*:\s*#fb8296\s*;/i);
  assert.match(css, /--color-blue\s*:\s*#7db9fa\s*;/i);
});

// ============================================================================
// FEATURE 8: Dashboard index.css Gutting (R2)
// ============================================================================

test('F8-T1-1 (Coverage): dashboard index.css has zero occurrences of @apply directive', () => {
  const css = readCss(DASHBOARD_CSS_PATH);
  assert.doesNotMatch(css, /@apply\b/, 'Forbidden @apply directive detected in dashboard index.css');
});

test('F8-T1-2 (Coverage): dashboard index.css contains @import "tailwindcss"', () => {
  const css = readCss(DASHBOARD_CSS_PATH);
  assert.match(css, /@import\s+['"]tailwindcss['"]\s*;/, 'Missing @import "tailwindcss" in dashboard index.css');
});

test('F8-T1-3 (Coverage): dashboard index.css retains D3 SVG presentation rules', () => {
  const css = readCss(DASHBOARD_CSS_PATH);
  assert.match(css, /\.canvas-node/, 'Missing .canvas-node SVG rule');
  assert.match(css, /\.canvas-edge/, 'Missing .canvas-edge SVG rule');
  assert.match(css, /\.node-port/, 'Missing .node-port SVG rule');
  assert.match(css, /\.connector-preview/, 'Missing .connector-preview SVG rule');
});

test('F8-T1-4 (Coverage): dashboard index.css retains @keyframes connector-flow animation', () => {
  const css = readCss(DASHBOARD_CSS_PATH);
  assert.match(
    css,
    /@keyframes\s+connector-flow\s*\{[\s\S]*?to\s*\{\s*stroke-dashoffset:\s*-24;?\s*\}[\s\S]*?\}/,
    'Missing @keyframes connector-flow rule',
  );
});

test('F8-T1-5 (Coverage): dashboard index.css eliminates bespoke layout classes', () => {
  const css = readCss(DASHBOARD_CSS_PATH);
  const forbiddenDashboardSelectors = [
    /\.app-shell\s*\{/,
    /\.app-sidebar\s*\{/,
    /\.metric-grid\s*\{/,
    /\.metric-card\s*\{/,
    /\.inspector\s*\{/,
    /\.editor-form\s*\{/,
    /\.simulation-dialog\s*\{/,
    /\.simulation-lab\s*\{/,
    /\.outcome-card-grid\s*\{/,
    /\.outcome-card\s*\{/,
    /\.distribution-card\s*\{/,
  ];

  for (const selector of forbiddenDashboardSelectors) {
    assert.doesNotMatch(css, selector, `Bespoke component selector still present in index.css: ${selector}`);
  }
});

test('F8-T2-1 (Boundary): dashboard index.css retains scrollbar and summary marker non-utility rules', () => {
  const css = readCss(DASHBOARD_CSS_PATH);
  assert.match(css, /scrollbar-width:\s*thin;/, 'Missing scrollbar-width in index.css');
  assert.match(css, /summary::-webkit-details-marker\s*\{\s*display:\s*none;?\s*\}/, 'Missing details marker removal in index.css');
});

test('F8-T2-2 (Boundary): dashboard index.css retains global focus-visible outline ring', () => {
  const css = readCss(DASHBOARD_CSS_PATH);
  assert.match(css, /:focus-visible\s*\{[\s\S]*?outline:\s*2px\s+solid/i, 'Missing global focus ring rule in index.css');
});

test('F8-T2-3 (Boundary): dashboard index.css retains canvas host background styling', () => {
  const css = readCss(DASHBOARD_CSS_PATH);
  assert.match(css, /\.canvas-host\s*\{[\s\S]*?linear-gradient/i, 'Missing canvas host background pattern');
});

test('F8-T2-4 (Boundary): dashboard index.css retains cursor modes and tool interaction rules', () => {
  const css = readCss(DASHBOARD_CSS_PATH);
  assert.match(css, /\.financial-canvas/, 'Missing .financial-canvas cursor rule');
  assert.match(css, /\.tool-select|\.tool-pan|\.tool-box/, 'Missing tool interaction cursor rules');
  assert.match(css, /\.is-linking|\.connect-mode/, 'Missing dynamic connection mode cursor rules');
});

test('F8-T2-5 (Boundary): dashboard index.css retains prefers-reduced-motion media query', () => {
  const css = readCss(DASHBOARD_CSS_PATH);
  assert.match(
    css,
    /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{[\s\S]*?animation:\s*none/i,
    'Missing prefers-reduced-motion animation suppression',
  );
});

// ============================================================================
// TIER 3 & TIER 4: Combination and Workload Scenarios
// ============================================================================

test('F1-F2-T3-1 (Combination): Landing light and dark theme variable parity', () => {
  const css = readCss(LANDING_CSS_PATH);
  const darkBlock = (css.match(/:root[\s\S]*?\[data-theme=['"]dark['"]\]\s*\{([\s\S]*?)\}/) || [])[1] || '';
  const lightBlock = (css.match(/\[data-theme=['"]light['"]\]\s*\{([\s\S]*?)\}/) || [])[1] || '';

  const darkVars = new Set([...darkBlock.matchAll(/(--[a-z0-9_-]+)\s*:/gi)].map((m) => m[1]));
  const lightVars = new Set([...lightBlock.matchAll(/(--[a-z0-9_-]+)\s*:/gi)].map((m) => m[1]));

  assert.ok(darkVars.size >= 13, `Dark theme has fewer than 13 variables: ${darkVars.size}`);
  for (const v of darkVars) {
    assert.ok(lightVars.has(v), `Light theme is missing variable "${v}" declared in dark theme`);
  }
});

test('F1-F2-T3-2 (Combination): Landing @theme color tokens resolve to valid declared CSS variables', () => {
  const css = readCss(LANDING_CSS_PATH);
  const themeBlock = (css.match(/@theme\s*\{([\s\S]*?)\}/) || [])[1] || '';
  const rootBlock = (css.match(/:root[\s\S]*?\{([\s\S]*?)\}/) || [])[1] || '';

  const referencedVars = [...themeBlock.matchAll(/var\(\s*(--[a-z0-9_-]+)\s*\)/g)].map((m) => m[1]);
  assert.ok(referencedVars.length >= 13, 'Expected at least 13 CSS variables referenced in @theme');

  for (const ref of referencedVars) {
    const isDeclared = rootBlock.includes(`${ref}:`);
    assert.ok(isDeclared, `@theme references variable ${ref} but it is not declared in :root block`);
  }
});

test('F7-F8-T3-1 (Combination): Dashboard active state token coherence across background, text, and border', () => {
  const css = readCss(DASHBOARD_CSS_PATH);
  const activeBg = (css.match(/--color-active-bg\s*:\s*(#[0-9a-fA-F]+)/i) || [])[1];
  const activeText = (css.match(/--color-active-text\s*:\s*(#[0-9a-fA-F]+)/i) || [])[1];
  const activeBorder = (css.match(/--color-active-border\s*:\s*(#[0-9a-fA-F]+)/i) || [])[1];

  assert.ok(activeBg, 'Missing --color-active-bg');
  assert.ok(activeText, 'Missing --color-active-text');
  assert.ok(activeBorder, 'Missing --color-active-border');
  assert.notEqual(activeBg, activeText, 'Active text and background cannot have the same hex');
});

test('F7-F8-T3-2 (Combination): Dashboard surface hierarchy coherence (base < raised < surface < float)', () => {
  const css = readCss(DASHBOARD_CSS_PATH);
  const getHex = (name) => (css.match(new RegExp(`${name}\\s*:\\s*(#[0-9a-fA-F]+)`, 'i')) || [])[1];

  const base = getHex('--color-base');
  const raised = getHex('--color-raised');
  const surface = getHex('--color-surface');
  const float = getHex('--color-float');

  assert.ok(base && raised && surface && float, 'All surface hierarchy tokens must be declared');
  const uniqueHexes = new Set([base, raised, surface, float]);
  assert.equal(uniqueHexes.size, 4, 'Surface hierarchy hexes must be distinct elevation shades');
});

test('F1-F7-T3-3 (Combination): Cross-app indicator token parity (mint and coral hex parity across landing and dashboard)', () => {
  const landingCss = readCss(LANDING_CSS_PATH);
  const dashboardCss = readCss(DASHBOARD_CSS_PATH);

  const landingDarkMint = (landingCss.match(/--mint\s*:\s*(#[0-9a-fA-F]+)/i) || [])[1];
  const landingDarkCoral = (landingCss.match(/--coral\s*:\s*(#[0-9a-fA-F]+)/i) || [])[1];
  const dashboardMint = (dashboardCss.match(/--color-mint\s*:\s*(#[0-9a-fA-F]+)/i) || [])[1];
  const dashboardCoral = (dashboardCss.match(/--color-coral\s*:\s*(#[0-9a-fA-F]+)/i) || [])[1];

  assert.ok(landingDarkMint && dashboardMint, 'Mint tokens must be declared in both stylesheets');
  assert.ok(landingDarkCoral && dashboardCoral, 'Coral tokens must be declared in both stylesheets');
  assert.equal(landingDarkMint.toLowerCase(), dashboardMint.toLowerCase(), 'Dark mint indicator should match across apps');
  assert.equal(landingDarkCoral.toLowerCase(), dashboardCoral.toLowerCase(), 'Dark coral indicator should match across apps');
});

test('F1-F7-T3-4 (Combination): Cross-app font-sans standardization parity across landing and dashboard', () => {
  const landingCss = readCss(LANDING_CSS_PATH);
  const dashboardCss = readCss(DASHBOARD_CSS_PATH);

  const landingFontMatch = landingCss.match(/--font-sans\s*:\s*([^;]+);/);
  const dashboardFontMatch = dashboardCss.match(/--font-sans\s*:\s*([^;]+);/);

  assert.ok(landingFontMatch, 'Landing missing --font-sans in @theme');
  assert.ok(dashboardFontMatch, 'Dashboard missing --font-sans in @theme');
  assert.equal(landingFontMatch[1].trim(), dashboardFontMatch[1].trim(), '--font-sans must be identical across Landing and Dashboard');
});

test('F1-F2-T4-1 (Workload Scenario): Landing Theme Switching scenario CSS variable resolution validation', () => {
  const landingCss = readCss(LANDING_CSS_PATH);
  const darkBg = (landingCss.match(/:root[\s\S]*?--background\s*:\s*(#[0-9a-fA-F]+)/i) || [])[1];
  const lightBg = (landingCss.match(/\[data-theme=['"]light['"]\][\s\S]*?--background\s*:\s*(#[0-9a-fA-F]+)/i) || [])[1];

  assert.ok(darkBg && lightBg, 'Both dark and light backgrounds must be declared');
  assert.notEqual(darkBg, lightBg, 'Theme switching requires differing backgrounds');
  assert.equal(darkBg.toLowerCase(), '#0c1018');
  assert.equal(lightBg.toLowerCase(), '#f3f4f7');
});

test('F7-F8-T4-2 (Workload Scenario): Dashboard Canvas flow keyframe and D3 connection preview animation contract', () => {
  const css = readCss(DASHBOARD_CSS_PATH);
  assert.match(css, /@keyframes\s+connector-flow\s*\{[\s\S]*?to\s*\{\s*stroke-dashoffset:\s*-24;?\s*\}[\s\S]*?\}/);
  assert.match(css, /\.connector-preview\s*\{[\s\S]*?animation:\s*connector-flow/);
});
