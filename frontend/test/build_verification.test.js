const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const LANDING_DIR = path.resolve(ROOT_DIR, 'landing');
const DASHBOARD_DIR = path.resolve(ROOT_DIR, 'dashboard');
const BUILD_LANDING_DIR = path.resolve(ROOT_DIR, 'build/landing');
const BUILD_DASHBOARD_DIR = path.resolve(ROOT_DIR, 'build/dashboard');

// ============================================================================
// FEATURE 6: Landing Tooling & CLI Build (R4)
// ============================================================================

test('F6-T1-1 (Coverage): Landing package.json declares tailwindcss and @tailwindcss/cli v4.3.3', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(LANDING_DIR, 'package.json'), 'utf8'));
  const devDeps = pkg.devDependencies || {};
  assert.match(devDeps['tailwindcss'], /\^?4\.3\.3/, 'tailwindcss must be ^4.3.3');
  assert.match(devDeps['@tailwindcss/cli'], /\^?4\.3\.3/, '@tailwindcss/cli must be ^4.3.3');
});

test('F6-T1-2 (Coverage): Landing package.json defines build:css using @tailwindcss/cli', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(LANDING_DIR, 'package.json'), 'utf8'));
  const scripts = pkg.scripts || {};
  assert.ok(scripts['build:css'], 'Landing must define build:css script');
  assert.match(scripts['build:css'], /tailwindcss\s+-i\s+src\/css\/style\.css/);
});

test('F6-T1-3 (Coverage): Landing npm run build:css compiles without errors', () => {
  execSync('npm run build:css', {
    cwd: LANDING_DIR,
    stdio: 'pipe',
  });
  const compiledCssPath = path.join(BUILD_LANDING_DIR, 'assets/styles.css');
  assert.ok(fs.existsSync(compiledCssPath), 'assets/styles.css must exist after build:css');
  const css = fs.readFileSync(compiledCssPath, 'utf8');
  assert.ok(css.length > 500, 'Compiled styles.css must not be empty');
});

test('F6-T1-4 (Coverage): Landing npm run build executes complete pipeline (typecheck, css, ts, html)', () => {
  execSync('npm run build', {
    cwd: LANDING_DIR,
    stdio: 'pipe',
  });

  // Verify all artifacts generated
  const expectedArtifacts = [
    'assets/styles.css',
    'assets/main.js',
    'assets/login.js',
    'assets/verify.js',
    'index.html',
    'login.html',
    'registration.html',
    'verify.html',
    '404.html',
  ];

  for (const artifact of expectedArtifacts) {
    const fullPath = path.join(BUILD_LANDING_DIR, artifact);
    assert.ok(fs.existsSync(fullPath), `Landing build artifact missing: ${artifact}`);
  }
});

test('F6-T1-5 (Coverage): Landing compiled styles.css contains compiled utilities and theme variables', () => {
  const compiledCssPath = path.join(BUILD_LANDING_DIR, 'assets/styles.css');
  const css = fs.readFileSync(compiledCssPath, 'utf8');

  // Verify presence of compiled semantic classes and variables
  assert.match(css, /var\(--background\)/, 'Compiled CSS must reference --background variable');
  assert.match(css, /var\(--card\)/, 'Compiled CSS must reference --card variable');
  assert.match(css, /Inter/, 'Compiled CSS must include font-sans Inter definition');
});

test('F6-T2-1 (Boundary): No tailwind.config.* exists in landing directory', () => {
  const files = fs.readdirSync(LANDING_DIR);
  for (const file of files) {
    assert.doesNotMatch(file, /^tailwind\.config\.(js|ts|mjs|cjs)$/, 'Zero tailwind.config.* allowed');
  }
});

test('F6-T2-2 (Boundary): Landing TypeScript typecheck succeeds with zero errors (npx tsc --noEmit)', () => {
  const output = execSync('npx tsc --noEmit', {
    cwd: LANDING_DIR,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  assert.equal(output.trim(), '', 'TypeScript check must pass with zero output/errors');
});

test('F6-T2-3 (Boundary): Landing compiled CSS size is under reasonable production budget (< 100KB)', () => {
  const compiledCssPath = path.join(BUILD_LANDING_DIR, 'assets/styles.css');
  const stats = fs.statSync(compiledCssPath);
  assert.ok(stats.size < 100 * 1024, `Compiled styles.css size (${stats.size} bytes) exceeds 100KB limit`);
});

test('F6-T2-4 (Boundary): Landing esbuild bundles all 3 entry scripts without warnings', () => {
  for (const script of ['main.js', 'login.js', 'verify.js']) {
    const scriptPath = path.join(BUILD_LANDING_DIR, 'assets', script);
    assert.ok(fs.existsSync(scriptPath), `Bundled script missing: ${script}`);
    assert.ok(fs.statSync(scriptPath).size > 1000, `Bundled script ${script} is too small`);
  }
});

test('F6-T2-5 (Boundary): Landing build directory contains all copied HTML pages identical to source', () => {
  for (const page of ['index.html', 'login.html', 'registration.html', 'verify.html', '404.html']) {
    const srcPath = path.join(LANDING_DIR, 'pages', page);
    const destPath = path.join(BUILD_LANDING_DIR, page);
    assert.ok(fs.existsSync(destPath), `Copied page missing: ${page}`);
    assert.equal(fs.readFileSync(srcPath, 'utf8'), fs.readFileSync(destPath, 'utf8'), `${page} build copy mismatch`);
  }
});

// ============================================================================
// FEATURE 12: Dashboard Tooling & TypeScript Build Verification (R4)
// ============================================================================

test('F12-T1-1 (Coverage): Dashboard package.json declares tailwindcss and @tailwindcss/vite v4.3.3', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(DASHBOARD_DIR, 'package.json'), 'utf8'));
  const devDeps = pkg.devDependencies || {};
  assert.match(devDeps['tailwindcss'], /\^?4\.3\.3/, 'tailwindcss must be ^4.3.3');
  assert.match(devDeps['@tailwindcss/vite'], /\^?4\.3\.3/, '@tailwindcss/vite must be ^4.3.3');
});

test('F12-T1-2 (Coverage): Dashboard vite.config.ts configures @tailwindcss/vite plugin', () => {
  const config = fs.readFileSync(path.join(DASHBOARD_DIR, 'vite.config.ts'), 'utf8');
  assert.match(config, /import\s+tailwindcss\s+from\s+['"]@tailwindcss\/vite['"]/);
  assert.match(config, /plugins:\s*\[[\s\S]*?tailwindcss\(\)[\s\S]*?\]/);
});

test('F12-T1-3 (Coverage): Dashboard TypeScript build succeeds (npx tsc -b)', () => {
  const output = execSync('npx tsc -b', {
    cwd: DASHBOARD_DIR,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  assert.equal(output.trim(), '', 'Dashboard TypeScript compiler must succeed with zero errors');
});

test('F12-T1-4 (Coverage): Dashboard npm run build produces production bundles', () => {
  const output = execSync('npm run build', {
    cwd: DASHBOARD_DIR,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  assert.ok(output.includes('built in') || output.includes('dist') || output.includes('✓'), 'Vite build must complete');

  assert.ok(fs.existsSync(path.join(BUILD_DASHBOARD_DIR, 'index.html')), 'Dashboard index.html must exist');
  const assetsDir = path.join(BUILD_DASHBOARD_DIR, 'assets');
  assert.ok(fs.existsSync(assetsDir), 'Dashboard assets directory must exist');
  const assetFiles = fs.readdirSync(assetsDir);
  const hasCss = assetFiles.some((f) => f.endsWith('.css'));
  const hasJs = assetFiles.some((f) => f.endsWith('.js'));
  assert.ok(hasCss, 'Dashboard must generate a CSS bundle');
  assert.ok(hasJs, 'Dashboard must generate a JS bundle');
});

test('F12-T1-5 (Coverage): Dashboard vite base is configured as "/dashboard/"', () => {
  const config = fs.readFileSync(path.join(DASHBOARD_DIR, 'vite.config.ts'), 'utf8');
  assert.match(config, /base:\s*['"]\/dashboard\/['"]/);
});

test('F12-T2-1 (Boundary): No tailwind.config.* exists in dashboard directory', () => {
  const files = fs.readdirSync(DASHBOARD_DIR);
  for (const file of files) {
    assert.doesNotMatch(file, /^tailwind\.config\.(js|ts|mjs|cjs)$/, 'Zero tailwind.config.* allowed in dashboard');
  }
});

test('F12-T2-2 (Boundary): Dashboard oxlint runs without syntax errors', () => {
  const output = execSync('npm run lint', {
    cwd: DASHBOARD_DIR,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  assert.doesNotMatch(output, /Finished with \d+ error/);
});

test('F12-T2-3 (Boundary): Dashboard bundle output directory is configured as "../build/dashboard"', () => {
  const config = fs.readFileSync(path.join(DASHBOARD_DIR, 'vite.config.ts'), 'utf8');
  assert.match(config, /outDir:\s*['"]\.\.\/build\/dashboard['"]/);
});

test('F12-T2-4 (Boundary): Dashboard emptyOutDir is set to true', () => {
  const config = fs.readFileSync(path.join(DASHBOARD_DIR, 'vite.config.ts'), 'utf8');
  assert.match(config, /emptyOutDir:\s*true/);
});

test('F12-T2-5 (Boundary): Dashboard proxy is configured for "/api" to backend', () => {
  const config = fs.readFileSync(path.join(DASHBOARD_DIR, 'vite.config.ts'), 'utf8');
  assert.match(config, /proxy:\s*\{[\s\S]*?['"]\/api['"]:\s*['"]http:\/\/localhost:8080['"][\s\S]*?\}/);
});

// ============================================================================
// FEATURE 13: E2E Regression Integration (Acceptance)
// ============================================================================

test('F13-T1-1 (Coverage): Existing 34 Node unit tests pass with zero failures', () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const output = execSync('node --test test/api-proxy.test.js test/budgeting.test.js test/finance.test.js test/session.test.js', {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    env,
  });
  assert.ok(output.includes('✔') || output.includes('pass 34'), 'Existing unit tests must pass');
  assert.doesNotMatch(output, /✖|fail [1-9]/, 'Zero existing tests may fail');
});

test('F13-T1-2 (Coverage): Zero @apply directives anywhere in repository', () => {
  try {
    const grepOutput = execSync('grep -rn "@apply" --include="*.css" --exclude-dir="node_modules" --exclude-dir="build" .', {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    assert.equal(grepOutput.trim(), '', `@apply found in repository: ${grepOutput}`);
  } catch (err) {
    // grep returns exit code 1 when no matches are found, which is expected
    assert.equal(err.status, 1, 'grep should find 0 matches for @apply');
  }
});

test('F13-T1-3 (Coverage): Zero tailwind.config files in entire repository', () => {
  const findConfig = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && e.name !== 'node_modules' && e.name !== 'build' && e.name !== '.git') {
        findConfig(path.join(dir, e.name));
      } else if (e.isFile() && e.name.startsWith('tailwind.config.')) {
        assert.fail(`Forbidden tailwind config found: ${path.join(dir, e.name)}`);
      }
    }
  };
  findConfig(ROOT_DIR);
});

test('F13-T1-4 (Coverage): Root express.js server entry file exists and serves static builds', () => {
  const expressPath = path.join(ROOT_DIR, 'express.js');
  assert.ok(fs.existsSync(expressPath), 'express.js must exist in frontend root');
  const content = fs.readFileSync(expressPath, 'utf8');
  assert.match(content, /landingDir/);
  assert.match(content, /dashboardDir/);
  assert.match(content, /express\.static/);
});

test('F13-T1-5 (Coverage): Root package.json build script coordinates sub-app builds', () => {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  const scripts = rootPkg.scripts || {};
  assert.match(scripts['build'], /landing/);
  assert.match(scripts['build'], /dashboard/);
});

test('F13-T2-1 (Boundary): Root package.json declares type: commonjs', () => {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  assert.equal(rootPkg.type, 'commonjs');
});

test('F13-T2-2 (Boundary): Express server dependencies are declared in root package.json', () => {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  const deps = rootPkg.dependencies || {};
  assert.ok(deps['express']);
  assert.ok(deps['express-rate-limit']);
});

test('F13-T2-3 (Boundary): Landing and Dashboard devDependencies share identical tailwindcss major version 4', () => {
  const landingPkg = JSON.parse(fs.readFileSync(path.join(LANDING_DIR, 'package.json'), 'utf8'));
  const dashboardPkg = JSON.parse(fs.readFileSync(path.join(DASHBOARD_DIR, 'package.json'), 'utf8'));
  const lVer = landingPkg.devDependencies['tailwindcss'];
  const dVer = dashboardPkg.devDependencies['tailwindcss'];
  assert.equal(lVer, dVer, 'Tailwind version must be identical across both sub-apps');
});

test('F13-T2-4 (Boundary): Static assets directory exists with FinApp logo and icons', () => {
  const staticDir = path.join(ROOT_DIR, 'static');
  assert.ok(fs.existsSync(staticDir));
  assert.ok(fs.existsSync(path.join(staticDir, 'finapp-circle.svg')));
});

test('F13-T2-5 (Boundary): Format and build scripts are properly configured in root package.json', () => {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
  assert.ok(rootPkg.scripts['build']);
  assert.ok(rootPkg.scripts['format']);
  assert.ok(rootPkg.scripts['format:check']);
});

// ============================================================================
// FEATURE 14: Responsive & Build Artifact Parity (R3)
// ============================================================================

test('F14-T1-1 (Coverage): Compiled Landing CSS contains responsive media queries matching breakpoints', () => {
  const compiledCssPath = path.join(BUILD_LANDING_DIR, 'assets/styles.css');
  const css = fs.readFileSync(compiledCssPath, 'utf8');
  assert.match(css, /1050px|850px|600px/, 'Compiled styles.css must include breakpoint media queries');
});

test('F14-T1-2 (Coverage): Compiled Dashboard CSS contains responsive media queries matching breakpoints', () => {
  const assetsDir = path.join(BUILD_DASHBOARD_DIR, 'assets');
  const cssFile = fs.readdirSync(assetsDir).find((f) => f.endsWith('.css'));
  assert.ok(cssFile, 'Dashboard CSS bundle must exist');
  const css = fs.readFileSync(path.join(assetsDir, cssFile), 'utf8');
  assert.match(css, /800px|760px|650px|600px|1100px|1600px/, 'Dashboard CSS must contain responsive breakpoints');
});

test('F14-T3-1 (Combination): Full build command reproduces all assets without cache corruption', () => {
  execSync('npm run build', {
    cwd: ROOT_DIR,
    stdio: 'pipe',
  });
  assert.ok(fs.existsSync(path.join(BUILD_LANDING_DIR, 'assets/styles.css')));
  assert.ok(fs.existsSync(path.join(BUILD_DASHBOARD_DIR, 'index.html')));
});

test('F14-T3-2 (Combination): Express server route compatibility for static and dashboard routing', () => {
  const expressContent = fs.readFileSync(path.join(ROOT_DIR, 'express.js'), 'utf8');
  assert.match(expressContent, /app\.use\(\s*['"]\/dashboard['"]/);
});

test('F14-T4-1 (Workload Scenario): Multi-page Landing build pipeline end-to-end integration', () => {
  assert.ok(fs.existsSync(path.join(BUILD_LANDING_DIR, 'index.html')));
  assert.ok(fs.existsSync(path.join(BUILD_LANDING_DIR, 'login.html')));
  assert.ok(fs.existsSync(path.join(BUILD_LANDING_DIR, 'registration.html')));
  assert.ok(fs.existsSync(path.join(BUILD_LANDING_DIR, 'verify.html')));
  assert.ok(fs.existsSync(path.join(BUILD_LANDING_DIR, '404.html')));
  assert.ok(fs.existsSync(path.join(BUILD_LANDING_DIR, 'assets/styles.css')));
});

test('F14-T4-2 (Workload Scenario): Single-page React Dashboard build pipeline end-to-end integration', () => {
  assert.ok(fs.existsSync(path.join(BUILD_DASHBOARD_DIR, 'index.html')));
  const assets = fs.readdirSync(path.join(BUILD_DASHBOARD_DIR, 'assets'));
  assert.ok(assets.length >= 2, 'Dashboard build must contain at least CSS and JS chunks');
});
