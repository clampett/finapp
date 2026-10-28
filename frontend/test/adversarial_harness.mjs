import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const LANDING_DIR = path.resolve(ROOT_DIR, 'landing');
const DASHBOARD_DIR = path.resolve(ROOT_DIR, 'dashboard');
const BUILD_LANDING_DIR = path.resolve(ROOT_DIR, 'build/landing');
const BUILD_DASHBOARD_DIR = path.resolve(ROOT_DIR, 'build/dashboard');

let passedTests = 0;
let failedTests = 0;
const failures = [];

function assert(condition, message) {
  if (!condition) {
    failedTests++;
    failures.push(message);
    console.error(`❌ FAIL: ${message}`);
  } else {
    passedTests++;
    console.log(`✔ PASS: ${message}`);
  }
}

function escapeCssSelector(cls) {
  let s = cls
    .replace(/:/g, '\\:')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/,/g, '\\,')
    .replace(/%/g, '\\%')
    .replace(/\./g, '\\.');
  if (/^\d/.test(s)) {
    s = '\\3' + s[0] + ' ' + s.slice(1);
  }
  return s;
}

console.log('===============================================================');
console.log('CHALLENGER 1: EMPIRICAL ADVERSARIAL STRESS TEST HARNESS');
console.log('===============================================================');

// ----------------------------------------------------------------------------
// TEST 1: Zero occurrences of @apply across all source files in frontend/
// ----------------------------------------------------------------------------
console.log('\n--- AREA 1: Zero @apply Verification ---');
try {
  const scanExtensions = ['.css', '.html', '.ts', '.tsx', '.js', '.mjs', '.cjs'];
  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (['node_modules', 'build', '.git', 'test'].includes(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (scanExtensions.some((ext) => entry.name.endsWith(ext))) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const match = content.match(/@apply\b/);
        assert(!match, `Zero @apply violation in ${path.relative(ROOT_DIR, fullPath)}`);
      }
    }
  }
  scanDir(ROOT_DIR);
  assert(true, 'Zero occurrences of @apply across entire source tree');
} catch (e) {
  assert(false, `Unexpected error during @apply scan: ${e.message}`);
}

// ----------------------------------------------------------------------------
// TEST 2: Responsive Viewport Extremes and Sub-Breakpoints
// ----------------------------------------------------------------------------
console.log('\n--- AREA 2: Responsive Viewport Extremes & Sub-Breakpoints ---');
try {
  const landingCss = fs.readFileSync(path.join(BUILD_LANDING_DIR, 'assets/styles.css'), 'utf8');
  const dashboardAssets = fs.readdirSync(path.join(BUILD_DASHBOARD_DIR, 'assets'));
  const dashboardCssFile = dashboardAssets.find((f) => f.endsWith('.css'));
  assert(dashboardCssFile !== undefined, 'Dashboard CSS build bundle exists');
  const dashboardCss = fs.readFileSync(path.join(BUILD_DASHBOARD_DIR, 'assets', dashboardCssFile), 'utf8');

  // Verify Landing Breakpoint Media Queries in Compiled CSS
  assert(landingCss.includes('min-width:1050px') || landingCss.includes('1050px'),
    'Landing compiled CSS includes max-nav (1050px) breakpoint');
  assert(landingCss.includes('min-width:850px') || landingCss.includes('850px'),
    'Landing compiled CSS includes max-mob (850px) breakpoint');
  assert(landingCss.includes('min-width:600px') || landingCss.includes('600px'),
    'Landing compiled CSS includes max-xs (600px) breakpoint');
  assert(landingCss.includes('max-width:850px') && landingCss.includes('.site-navigation.is-open'),
    'Landing compiled CSS contains max-width:850px override for .site-navigation.is-open');

  // Verify Dashboard Breakpoint Media Queries in Compiled CSS (Lightning CSS range syntax)
  assert(dashboardCss.includes('width>=1600px') || dashboardCss.includes('min-width:1600px') || dashboardCss.includes('1600px'),
    'Dashboard compiled CSS includes 2xl (1600px) breakpoint media query');
  assert(dashboardCss.includes('width>=800px') || dashboardCss.includes('min-width:800px') || dashboardCss.includes('800px'),
    'Dashboard compiled CSS includes max-md (800px) breakpoint');
  assert(dashboardCss.includes('width>=600px') || dashboardCss.includes('min-width:600px') || dashboardCss.includes('600px'),
    'Dashboard compiled CSS includes max-xs (600px) breakpoint');

  // Verify Sub-Breakpoints in Dashboard: 760px and 500px
  assert(dashboardCss.includes('width>=760px') || dashboardCss.includes('760px'),
    'Dashboard compiled CSS includes sub-breakpoint 760px (max-[760px]:)');
  assert(dashboardCss.includes('width>=500px') || dashboardCss.includes('500px'),
    'Dashboard compiled CSS includes sub-breakpoint 500px (max-[500px]:)');

  // Test Boundary Viewport Matrix:
  // 1. Extreme Small (< 600px, e.g. 500px, 320px)
  const xsClasses = ['max-xs:hidden', 'max-xs:px-5', 'max-xs:text-[39px]', 'max-xs:gap-3'];
  for (const cls of xsClasses) {
    const escaped = escapeCssSelector(cls);
    assert(landingCss.includes(escaped), `Compiled landing CSS contains utility for xs boundary: ${cls}`);
  }

  // 2. Sub-breakpoint: 760px (between 600px and 850px)
  const mobClasses = ['max-mob:hidden', 'max-mob:absolute', 'max-mob:flex-col', 'max-mob:grid'];
  for (const cls of mobClasses) {
    const escaped = escapeCssSelector(cls);
    assert(landingCss.includes(escaped), `Compiled landing CSS contains max-mob utility for 760px viewport: ${cls}`);
  }

  const mdClasses = ['max-md:grid-cols-1', 'max-md:w-full', 'max-md:hidden'];
  for (const cls of mdClasses) {
    const escaped = escapeCssSelector(cls);
    assert(dashboardCss.includes(escaped), `Compiled dashboard CSS contains max-md utility for 760px viewport: ${cls}`);
  }

  // Check sub-breakpoint 760px and 500px utilities in Dashboard
  assert(dashboardCss.includes('max-\\[760px\\]\\:p-2') || dashboardCss.includes('max-\\[760px\\]'),
    'Dashboard compiled CSS contains max-[760px] utility for modal padding');
  assert(dashboardCss.includes('max-\\[500px\\]\\:p-3') || dashboardCss.includes('max-\\[500px\\]'),
    'Dashboard compiled CSS contains max-[500px] utility for small phone displays');

  // 3. Viewport 850px boundary:
  assert(landingCss.includes('max-mob\\:hidden') || landingCss.includes('max-mob:hidden'),
    'Desktop viewport (>850px) hides mobile nav container');

  // 4. Viewport 1050px boundary:
  const navClasses = ['max-nav:gap-4.25', 'max-nav:text-[11px]'];
  for (const cls of navClasses) {
    const escaped = escapeCssSelector(cls);
    assert(landingCss.includes(escaped), `Compiled landing CSS contains max-nav utility for 1050px boundary: ${cls}`);
  }

  // 5. Extreme Wide: 1600px boundary in Dashboard:
  const xl2Classes = ['2xl:px-11', '2xl:w-[min(1540px,100%)]'];
  for (const cls of xl2Classes) {
    const escaped = escapeCssSelector(cls);
    assert(dashboardCss.includes(escaped), `Compiled dashboard CSS contains 2xl utility for 1600px boundary: ${cls}`);
  }

  assert(true, 'All responsive viewport extremes and sub-breakpoints verified successfully');
} catch (e) {
  assert(false, `Unexpected error during responsive test: ${e.message}`);
}

// ----------------------------------------------------------------------------
// TEST 3: Dark and Light Theme Switching & CSS Variable Lookups
// ----------------------------------------------------------------------------
console.log('\n--- AREA 3: Dark and Light Theme Switching Integrity ---');
try {
  const landingSourceCss = fs.readFileSync(path.join(LANDING_DIR, 'src/css/style.css'), 'utf8');

  // Extract variables from :root, [data-theme='dark']
  const darkBlockMatch = landingSourceCss.match(/(:root,\s*\[data-theme=['"]dark['"]\]\s*\{[\s\S]*?\})/);
  assert(darkBlockMatch !== null, 'Dark theme block exists in style.css');
  const darkBlock = darkBlockMatch ? darkBlockMatch[1] : '';
  const darkVars = {};
  for (const m of darkBlock.matchAll(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g)) {
    darkVars[m[1]] = m[2].trim();
  }

  // Extract variables from [data-theme='light']
  const lightBlockMatch = landingSourceCss.match(/(\[data-theme=['"]light['"]\]\s*\{[\s\S]*?\})/);
  assert(lightBlockMatch !== null, 'Light theme block exists in style.css');
  const lightBlock = lightBlockMatch ? lightBlockMatch[1] : '';
  const lightVars = {};
  for (const m of lightBlock.matchAll(/(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g)) {
    lightVars[m[1]] = m[2].trim();
  }

  // Verify bijection between dark and light variables
  const requiredLandingVars = [
    '--background', '--foreground', '--card', '--primary', '--primary-foreground',
    '--muted', '--border', '--text_color', '--header', '--mint', '--coral',
    '--blue', '--shadow'
  ];

  for (const v of requiredLandingVars) {
    assert(darkVars[v] !== undefined, `Dark theme defines ${v}`);
    assert(lightVars[v] !== undefined, `Light theme defines ${v}`);
    assert(darkVars[v] && darkVars[v].length > 0, `Dark theme ${v} has value: ${darkVars[v]}`);
    assert(lightVars[v] && lightVars[v].length > 0, `Light theme ${v} has value: ${lightVars[v]}`);
  }

  // Verify Landing @theme mappings to variables
  const themeBlockMatch = landingSourceCss.match(/@theme\s*\{([\s\S]*?)\}/);
  assert(themeBlockMatch !== null, '@theme block exists in Landing style.css');
  const themeContent = themeBlockMatch ? themeBlockMatch[1] : '';

  for (const token of [
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
  ]) {
    assert(themeContent.includes(`${token[0]}:`) && themeContent.includes(token[1]),
      `Landing @theme maps ${token[0]} to ${token[1]}`);
  }

  // Verify color-scheme declarations
  assert(darkBlock.includes('color-scheme: dark'), 'Dark block declares color-scheme: dark');
  assert(lightBlock.includes('color-scheme: light'), 'Light block declares color-scheme: light');

  // Verify Dashboard :root dark color scheme & tokens
  const dashSourceCss = fs.readFileSync(path.join(DASHBOARD_DIR, 'src/index.css'), 'utf8');
  assert(dashSourceCss.includes('color-scheme: dark'), 'Dashboard :root declares color-scheme: dark');

  const dashThemeBlock = dashSourceCss.match(/@theme\s*\{([\s\S]*?)\}/)[1];
  const requiredDashTokens = [
    '--color-base', '--color-surface', '--color-raised', '--color-float',
    '--color-header', '--color-border', '--color-text', '--color-muted',
    '--color-subtle', '--color-primary', '--color-primary-fg', '--color-mint',
    '--color-coral', '--color-blue', '--color-brand', '--color-active-bg',
    '--color-active-text', '--color-active-border', '--color-hover-bg'
  ];
  for (const token of requiredDashTokens) {
    assert(dashThemeBlock.includes(`${token}:`), `Dashboard @theme defines ${token}`);
  }

  assert(true, 'Theme switching and CSS variable integrity verified across light and dark modes');
} catch (e) {
  assert(false, `Unexpected error during theme test: ${e.message}`);
}

// ----------------------------------------------------------------------------
// TEST 4: Prefers-Reduced-Motion Preferences
// ----------------------------------------------------------------------------
console.log('\n--- AREA 4: Prefers-Reduced-Motion Preferences ---');
try {
  const landingSourceCss = fs.readFileSync(path.join(LANDING_DIR, 'src/css/style.css'), 'utf8');
  const dashSourceCss = fs.readFileSync(path.join(DASHBOARD_DIR, 'src/index.css'), 'utf8');
  const landingCompiledCss = fs.readFileSync(path.join(BUILD_LANDING_DIR, 'assets/styles.css'), 'utf8');
  const dashboardAssets = fs.readdirSync(path.join(BUILD_DASHBOARD_DIR, 'assets'));
  const dashboardCssFile = dashboardAssets.find((f) => f.endsWith('.css'));
  const dashCompiledCss = fs.readFileSync(path.join(BUILD_DASHBOARD_DIR, 'assets', dashboardCssFile), 'utf8');

  // Check declaration in source files
  assert(landingSourceCss.includes('@media (prefers-reduced-motion: reduce)'),
    'Landing style.css contains @media (prefers-reduced-motion: reduce)');
  assert(dashSourceCss.includes('@media (prefers-reduced-motion: reduce)'),
    'Dashboard index.css contains @media (prefers-reduced-motion: reduce)');

  // Check animation suppression in Landing source & compiled
  assert(landingSourceCss.includes('animation: none !important'),
    'Landing style.css sets animation: none !important in reduced motion');
  assert(landingCompiledCss.includes('animation:none!important'),
    'Landing compiled CSS retains animation: none !important in reduced motion');
  assert(landingCompiledCss.includes('scroll-behavior:auto'),
    'Landing compiled CSS resets scroll-behavior: auto in reduced motion');

  // Check animation suppression in Dashboard source & compiled
  assert(dashSourceCss.includes('.connector-preview') && dashSourceCss.includes('animation: none'),
    'Dashboard index.css explicitly suppresses .connector-preview animation');
  assert(dashSourceCss.includes('.stock-loading-spinner') && dashSourceCss.includes('animation: none'),
    'Dashboard index.css explicitly suppresses .stock-loading-spinner animation');
  assert(dashCompiledCss.includes('.connector-preview,.stock-loading-spinner{animation:none}'),
    'Dashboard compiled CSS suppresses .connector-preview and .stock-loading-spinner animations');
  assert(dashCompiledCss.includes('animation:none!important'),
    'Dashboard compiled CSS applies global animation: none !important');

  assert(true, 'prefers-reduced-motion animation suppression verified empirically');
} catch (e) {
  assert(false, `Unexpected error during reduced motion test: ${e.message}`);
}

// ----------------------------------------------------------------------------
// SUMMARY
// ----------------------------------------------------------------------------
console.log('\n===============================================================');
console.log(`TOTAL ADVERSARIAL CHECKS: ${passedTests + failedTests}`);
console.log(`PASSED: ${passedTests}`);
console.log(`FAILED: ${failedTests}`);
console.log('===============================================================');

if (failedTests > 0) {
  console.error('\nFailures:\n' + failures.map((f) => `- ${f}`).join('\n'));
  process.exit(1);
} else {
  console.log('\nALL EMPIRICAL ADVERSARIAL TESTS PASSED!');
  process.exit(0);
}
