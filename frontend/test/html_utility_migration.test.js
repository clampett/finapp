const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const PAGES_DIR = path.resolve(ROOT_DIR, 'landing/pages');

function readPage(fileName) {
  return fs.readFileSync(path.join(PAGES_DIR, fileName), 'utf8');
}

// ============================================================================
// FEATURE 3: Landing index.html Utility Migration (R1)
// ============================================================================

test('F3-T1-1 (Coverage): index.html eliminates top-level bespoke layout classes', () => {
  const html = readPage('index.html');
  const forbiddenClasses = [
    'class="site-container"',
    'class="site-header"',
    'class="hero"',
    'class="hero-copy"',
    'class="hero-actions"',
    'class="feature-grid"',
    'class="feature-card"',
    'class="workflow-section"',
    'class="workflow-layout"',
    'class="scenario-grid"',
    'class="scenario-card"',
    'class="faq-section"',
    'class="final-cta"',
    'class="site-footer"',
  ];

  for (const cls of forbiddenClasses) {
    assert.ok(
      !html.includes(cls),
      `Bespoke class pattern "${cls}" found in index.html; should be migrated to Tailwind utilities`,
    );
  }
});

test('F3-T1-2 (Coverage): index.html eliminates preview component BEM classes', () => {
  const html = readPage('index.html');
  const forbiddenPreviewClasses = [
    'class="product-preview"',
    'class="preview-titlebar"',
    'class="preview-app"',
    'class="preview-metrics"',
    'class="preview-footer"',
    'class="preview-selector"',
    'class="preview-note"',
  ];

  for (const cls of forbiddenPreviewClasses) {
    assert.ok(
      !html.includes(cls),
      `Bespoke preview class "${cls}" found in index.html; should be migrated to utilities`,
    );
  }
});

test('F3-T1-3 (Coverage): index.html uses Tailwind layout utilities (flex, grid, max-w, mx-auto)', () => {
  const html = readPage('index.html');
  assert.match(html, /\bmax-w-\[?1240px\]?|\bmax-w-7xl\b|\bmax-w-310\b/, 'Missing max-width container utility on main/sections');
  assert.match(html, /\bmx-auto\b/, 'Missing mx-auto centering utility');
  assert.match(html, /\bflex\b/, 'Missing flexbox utility');
  assert.match(html, /\bgrid\b/, 'Missing grid utility');
});

test('F3-T1-4 (Coverage): index.html uses semantic color tokens (bg-background, bg-card, text-text, etc.)', () => {
  const html = readPage('index.html');
  assert.match(html, /\bbg-background\b/, 'Missing bg-background utility token in index.html');
  assert.match(html, /\bbg-card\b/, 'Missing bg-card utility token in index.html');
  assert.match(html, /\btext-text\b/, 'Missing text-text utility token in index.html');
  assert.match(html, /\bborder-border\b/, 'Missing border-border utility token in index.html');
});

test('F3-T1-5 (Coverage): index.html uses responsive breakpoint variants (max-nav:, max-mob:, max-xs:)', () => {
  const html = readPage('index.html');
  const hasResponsiveVariants =
    html.includes('max-nav:') ||
    html.includes('max-mob:') ||
    html.includes('max-xs:') ||
    html.includes('nav:') ||
    html.includes('mob:') ||
    html.includes('xs:');
  assert.ok(hasResponsiveVariants, 'index.html must employ responsive breakpoint variants');
});

test('F3-T2-1 (Boundary): index.html preserves skip link with accessibility focus styling', () => {
  const html = readPage('index.html');
  assert.match(
    html,
    /<a[^>]+href=["']#main["'][^>]*>\s*Skip to content\s*<\/a\s*>/i,
    'Skip to content link must point to #main',
  );
  assert.match(html, /focus(-visible)?:/, 'Skip link must include focus utility classes');
});

test('F3-T2-2 (Boundary): index.html preserves main semantic landmark with id="main"', () => {
  const html = readPage('index.html');
  assert.match(html, /<main[^>]+id=["']main["']/i, 'Main landmark element with id="main" must be preserved');
});

test('F3-T2-3 (Boundary): index.html links to dedicated information pages', () => {
  const html = readPage('index.html');
  for (const route of ['features', 'how-it-works', 'scenarios', 'faq']) {
    assert.ok(html.includes(`href="/${route}"`), `Missing link to /${route}`);
    assert.ok(fs.existsSync(path.join(PAGES_DIR, `${route}.html`)));
  }
});

test('F3-T2-4 (Boundary): index.html preserves SVG preview graph and node structure', () => {
  const html = readPage('index.html');
  assert.match(html, /class=["'][^"']*preview-edges[^"']*["']/, 'SVG path must preserve class preview-edges');
  assert.match(html, /class=["'][^"']*sample-node[^"']*["']/, 'SVG groups must preserve class sample-node');
  assert.match(html, /id=["']preview-worth["']/, 'Must preserve #preview-worth metric element');
  assert.match(html, /id=["']preview-surplus["']/, 'Must preserve #preview-surplus metric element');
  assert.match(html, /id=["']preview-debt["']/, 'Must preserve #preview-debt metric element');
});

test('F3-T2-5 (Boundary): index.html preserves details/summary FAQ elements', () => {
  const html = readPage('index.html');
  const detailsCount = (html.match(/<details\b/gi) || []).length;
  const summaryCount = (html.match(/<summary\b/gi) || []).length;
  assert.ok(detailsCount >= 4, `Expected at least 4 <details> FAQ items, got ${detailsCount}`);
  assert.equal(detailsCount, summaryCount, 'Every <details> tag must have a matching <summary>');
});

// ============================================================================
// FEATURE 4: Landing Auth Pages Utility Migration (R1, R3)
// ============================================================================

test('F4-T1-1 (Coverage): login.html eliminates bespoke auth BEM classes', () => {
  const html = readPage('login.html');
  const forbidden = [
    'class="auth-page"',
    'class="auth-header"',
    'class="auth-main"',
    'class="auth-layout"',
    'class="auth-intro"',
    'class="auth-card"',
    'class="auth-form"',
    'class="auth-description"',
    'class="auth-footer"',
    'class="auth-switch"',
    'class="auth-divider"',
    'class="password-field"',
    'class="password-toggle"',
    'class="site-button',
  ];

  for (const cls of forbidden) {
    assert.ok(!html.includes(cls), `Bespoke auth class "${cls}" must be removed from login.html`);
  }
});

test('F4-T1-2 (Coverage): registration.html eliminates bespoke auth BEM classes', () => {
  const html = readPage('registration.html');
  const forbidden = [
    'class="auth-page"',
    'class="auth-header"',
    'class="auth-main"',
    'class="auth-layout"',
    'class="auth-intro"',
    'class="auth-card"',
    'class="auth-form"',
    'class="auth-description"',
    'class="auth-footer"',
    'class="auth-switch"',
    'class="password-field"',
    'class="password-toggle"',
  ];

  for (const cls of forbidden) {
    assert.ok(!html.includes(cls), `Bespoke auth class "${cls}" must be removed from registration.html`);
  }
});

test('F4-T1-3 (Coverage): verify.html eliminates bespoke auth BEM classes', () => {
  const html = readPage('verify.html');
  const forbidden = [
    'class="auth-page"',
    'class="auth-header"',
    'class="auth-main"',
    'class="auth-card',
    'class="auth-single"',
    'class="auth-form"',
    'class="verification-code"',
    'class="input-hint"',
    'class="site-button',
  ];

  for (const cls of forbidden) {
    assert.ok(!html.includes(cls), `Bespoke auth class "${cls}" must be removed from verify.html`);
  }
});

test('F4-T1-4 (Coverage): auth pages apply Tailwind utilities for form card and inputs', () => {
  const loginHtml = readPage('login.html');
  assert.match(loginHtml, /\bbg-card\b/, 'login.html card must use bg-card');
  assert.match(loginHtml, /\bborder\b/, 'login.html card must use border');
  assert.match(loginHtml, /\brounded-/, 'login.html card must use rounded utility');
  assert.match(loginHtml, /\bbg-primary\b/, 'login.html submit button must use bg-primary');
  assert.match(loginHtml, /\btext-primary-fg\b/, 'login.html submit button must use text-primary-fg');
});

test('F4-T1-5 (Coverage): auth pages preserve password visibility toggle hooks', () => {
  const loginHtml = readPage('login.html');
  const regHtml = readPage('registration.html');

  assert.match(
    loginHtml,
    /<button[^>]+data-password-toggle=["']password["']/i,
    'login.html must preserve button[data-password-toggle="password"]',
  );
  assert.match(
    regHtml,
    /<button[^>]+data-password-toggle=["']password["']/i,
    'registration.html must preserve button[data-password-toggle="password"]',
  );
  assert.match(
    regHtml,
    /<button[^>]+data-password-toggle=["']confirm-password["']/i,
    'registration.html must preserve button[data-password-toggle="confirm-password"]',
  );
});

test('F4-T2-1 (Boundary): login.html preserves essential form and status element IDs', () => {
  const html = readPage('login.html');
  assert.match(html, /id=["']login-form["']/, 'Must preserve #login-form');
  assert.match(html, /id=["']username["']/, 'Must preserve #username');
  assert.match(html, /id=["']password["']/, 'Must preserve #password');
  assert.match(html, /id=["']login-error["']/, 'Must preserve #login-error');
  assert.match(html, /id=["']login-status["']/, 'Must preserve #login-status');
  assert.match(html, /id=["']login_button["']/, 'Must preserve #login_button');
});

test('F4-T2-2 (Boundary): registration.html preserves essential form and status element IDs', () => {
  const html = readPage('registration.html');
  assert.match(html, /id=["']registration-form["']/, 'Must preserve #registration-form');
  assert.match(html, /id=["']email["']/, 'Must preserve #email');
  assert.match(html, /id=["']username["']/, 'Must preserve #username');
  assert.match(html, /id=["']password["']/, 'Must preserve #password');
  assert.match(html, /id=["']confirm-password["']/, 'Must preserve #confirm-password');
  assert.match(html, /id=["']registration-error["']/, 'Must preserve #registration-error');
  assert.match(html, /id=["']register_button["']/, 'Must preserve #register_button');
});

test('F4-T2-3 (Boundary): verify.html preserves essential verification element IDs', () => {
  const html = readPage('verify.html');
  assert.match(html, /id=["']verify-form["']/, 'Must preserve #verify-form');
  assert.match(html, /id=["']verification-code["']/, 'Must preserve #verification-code');
  assert.match(html, /id=["']resend-code["']/, 'Must preserve #resend-code');
  assert.match(html, /id=["']verify-error["']/, 'Must preserve #verify-error');
  assert.match(html, /id=["']verify-status["']/, 'Must preserve #verify-status');
  assert.match(html, /id=["']verify_button["']/, 'Must preserve #verify_button');
});

test('F4-T2-4 (Boundary): auth alert elements include role="alert" or role="status" and empty:hidden', () => {
  const loginHtml = readPage('login.html');
  assert.match(loginHtml, /id=["']login-error["'][^>]*role=["']alert["']/);
  assert.match(loginHtml, /id=["']login-status["'][^>]*role=["']status["']/);
  assert.match(loginHtml, /empty:hidden/, 'Alert elements should use empty:hidden utility class');
});

test('F4-T2-5 (Boundary): auth forms retain submit button disabled state styling (disabled:opacity-50)', () => {
  const loginHtml = readPage('login.html');
  assert.match(loginHtml, /disabled:opacity-50/, 'Submit button must style disabled state with utility');
});

// ============================================================================
// FEATURE 5: Landing 404.html Normalization (R1)
// ============================================================================

test('F5-T1-1 (Coverage): 404.html uses semantic token text-text instead of text-text_color', () => {
  const html = readPage('404.html');
  assert.doesNotMatch(html, /\btext-text_color\b/, '404.html must not use deprecated text-text_color');
  assert.match(html, /\btext-text\b/, '404.html must use semantic token text-text');
});

test('F5-T1-2 (Coverage): 404.html does not have duplicate closing anchor tag', () => {
  const html = readPage('404.html');
  assert.doesNotMatch(
    html,
    /<\/a>\s*<\/a>/,
    '404.html contains duplicate consecutive </a> closing tags',
  );
});

test('F5-T1-3 (Coverage): 404.html uses text-primary-fg instead of text-primary-foreground', () => {
  const html = readPage('404.html');
  assert.doesNotMatch(html, /\btext-primary-foreground\b/, '404.html must not use text-primary-foreground');
  assert.match(html, /\btext-primary-fg\b/, '404.html must use semantic utility text-primary-fg');
});

test('F5-T1-4 (Coverage): 404.html uses text-foreground instead of non-existent text-muted-foreground', () => {
  const html = readPage('404.html');
  assert.doesNotMatch(html, /\btext-muted-foreground\b/, '404.html must not use text-muted-foreground');
  assert.match(html, /\btext-foreground\b/, '404.html must use text-foreground');
});

test('F5-T1-5 (Coverage): 404.html returns to the root from any missing path', () => {
  const html = readPage('404.html');
  assert.match(html, /<a[^>]+href=["']\/["'][^>]*>[\s\S]*?Go back to homepage[\s\S]*?<\/a>/i);
});

test('F5-T2-1 (Boundary): 404.html has valid HTML structure (doctype, html, head, body)', () => {
  const html = readPage('404.html');
  assert.match(html, /<!DOCTYPE html>/i);
  assert.match(html, /<html\b[^>]*>/i);
  assert.match(html, /<head\b[^>]*>[\s\S]*?<\/head>/i);
  assert.match(html, /<body\b[^>]*>[\s\S]*?<\/body>/i);
});

test('F5-T2-2 (Boundary): 404.html links to compiled styles.css', () => {
  const html = readPage('404.html');
  assert.match(html, /<link[^>]+href=["']\/assets\/styles\.css["']/);
});

test('F5-T2-3 (Boundary): 404.html includes font-sans stack utility', () => {
  const html = readPage('404.html');
  assert.match(html, /\bfont-sans\b/, '404.html body should specify font-sans utility');
});

test('F5-T2-4 (Boundary): 404.html explains the error without a spinning image', () => {
  const html = readPage('404.html');
  assert.match(html, /<main[^>]*id="main"/);
  assert.match(html, /<svg[^>]*role="img"/);
  assert.doesNotMatch(html, /money_spin\.gif/);
});

test('F5-T2-5 (Boundary): 404.html preserves logo markup and homepage link', () => {
  const html = readPage('404.html');
  assert.match(html, /FinApp/);
  assert.match(html, /href=["']\/["']/);
});

// ============================================================================
// FEATURE 14: Responsive & Interactive Parity on Landing Pages (R3)
// ============================================================================

test('F14-T1-1 (Coverage): index.html restores the theme synchronously before CSS', () => {
  const html = readPage('index.html');
  const bootstrap = '<script src="/assets/theme-init.js"></script>';
  assert.ok(html.includes(bootstrap));
  assert.ok(html.indexOf(bootstrap) < html.indexOf('<link rel="stylesheet"'));
});

test('F14-T1-2 (Coverage): index.html includes #theme_button switcher and #menu-toggle button', () => {
  const html = readPage('index.html');
  assert.match(html, /<button[^>]+id=["']theme_button["']/i, 'Missing #theme_button');
  assert.match(html, /<button[^>]+id=["']menu-toggle["']/i, 'Missing #menu-toggle');
});

test('F14-T1-3 (Coverage): index.html preserves #site-navigation with class site-navigation', () => {
  const html = readPage('index.html');
  assert.match(
    html,
    /<nav[^>]+id=["']site-navigation["'][^>]*class=["'][^"']*site-navigation[^"']*["']/i,
    '#site-navigation must retain class site-navigation for JS classList toggle',
  );
});

test('F14-T1-4 (Coverage): index.html preview buttons use data-preview attribute and aria-pressed', () => {
  const html = readPage('index.html');
  for (const id of ['1', '2', '3']) {
    assert.match(
      html,
      new RegExp(`<button[^>]+data-preview=["']${id}["'][^>]*aria-pressed=`),
      `Missing button[data-preview="${id}"][aria-pressed]`,
    );
  }
});

test('F14-T1-5 (Coverage): all landing pages load appropriate compiled JS asset', () => {
  const indexHtml = readPage('index.html');
  const loginHtml = readPage('login.html');
  const regHtml = readPage('registration.html');
  const verifyHtml = readPage('verify.html');

  assert.match(indexHtml, /<script[^>]+src=["']\/assets\/main\.js["'][^>]*defer/i);
  assert.match(loginHtml, /<script[^>]+src=["']\/assets\/login\.js["'][^>]*defer/i);
  assert.match(regHtml, /<script[^>]+src=["']\/assets\/login\.js["'][^>]*defer/i);
  assert.match(verifyHtml, /<script[^>]+src=["']\/assets\/verify\.js["'][^>]*defer/i);
});

test('F14-T2-1 (Boundary): index.html mobile menu toggle has aria-controls and aria-expanded', () => {
  const html = readPage('index.html');
  assert.match(html, /<button[^>]+id=["']menu-toggle["'][^>]*aria-controls=["']site-navigation["']/i);
  assert.match(html, /<button[^>]+id=["']menu-toggle["'][^>]*aria-expanded=/i);
});

test('F14-T2-2 (Boundary): index.html preview selector container has role="group" and aria-label', () => {
  const html = readPage('index.html');
  assert.match(html, /role=["']group["'][^>]*aria-label=["']Preview a demo profile["']/i);
});

test('F14-T2-3 (Boundary): index.html preview cards contain aria-live region or semantic metric landmarks', () => {
  const html = readPage('index.html');
  assert.match(html, /id=["']preview-worth["']/);
  assert.match(html, /id=["']preview-open["']/);
});

test('F14-T2-4 (Boundary): login.html back link correctly links to home "/"', () => {
  const html = readPage('login.html');
  assert.match(html, /<a[^>]+href=["']\/["'][^>]*>← Back to home<\/a>/);
});

test('F14-T2-5 (Boundary): verify.html verification input enforces numeric pattern and maxlength', () => {
  const html = readPage('verify.html');
  assert.match(html, /<input[^>]+id=["']verification-code["'][^>]*maxlength=["']6["']/i);
});

// ============================================================================
// TIER 3 & TIER 4: Combinations and Realistic Application Scenarios
// ============================================================================

test('F3-F14-T3-1 (Combination): Landing data-theme attribute consistency across all 5 HTML files', () => {
  for (const page of ['index.html', 'login.html', 'registration.html', 'verify.html', '404.html']) {
    const html = readPage(page);
    assert.match(html, /<link[^>]+href=["']\/assets\/styles\.css["']/, `${page} must link to /assets/styles.css`);
  }
});

test('F3-F14-T3-2 (Combination): Landing auth switch cross-linking (login -> registration and registration -> login)', () => {
  const loginHtml = readPage('login.html');
  const regHtml = readPage('registration.html');

  assert.match(loginHtml, /href=["']\/registration["']/, 'login.html must link to /registration');
  assert.match(regHtml, /href=["']\/login["']/, 'registration.html must link to /login');
});

test('F3-F14-T3-3 (Combination): Landing demo workspace links direct to /dashboard/?demo=true', () => {
  const indexHtml = readPage('index.html');
  const loginHtml = readPage('login.html');

  assert.match(indexHtml, /href=["']\/dashboard\/\?demo=true/, 'index.html must link to /dashboard/?demo=true');
  assert.match(loginHtml, /href=["']\/dashboard\/\?demo=true/, 'login.html must link to /dashboard/?demo=true');
});

test('F3-F14-T3-4 (Combination): Focus ring utility consistency across interactive elements in landing pages', () => {
  const loginHtml = readPage('login.html');
  const focusMatches = loginHtml.match(/focus-visible:outline/g);
  assert.ok(focusMatches && focusMatches.length >= 3, 'Multiple interactive elements must define focus-visible ring utilities');
});

test('F3-F14-T4-1 (Workload Scenario): Landing Mobile Navigation interactive structure and ARIA contracts', () => {
  const html = readPage('index.html');
  assert.match(html, /<button[^>]+id=["']menu-toggle["']/i);
  assert.match(html, /<nav[^>]+id=["']site-navigation["']/i);
  assert.match(html, /class=["'][^"']*site-navigation[^"']*["']/);
});

test('F3-F14-T4-2 (Workload Scenario): Landing Scenario Preview Switcher multi-tab contract', () => {
  const html = readPage('index.html');
  assert.match(html, /data-preview=["']1["']/);
  assert.match(html, /data-preview=["']2["']/);
  assert.match(html, /data-preview=["']3["']/);
  assert.match(html, /id=["']preview-worth["']/);
  assert.match(html, /id=["']preview-surplus["']/);
  assert.match(html, /id=["']preview-debt["']/);
  assert.match(html, /id=["']preview-open["']/);
});
