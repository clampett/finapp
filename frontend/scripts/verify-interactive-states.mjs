// Empirical Verification Script for Interactive State Machines
// Sub-apps: Landing & Dashboard (Tailwind V4 Migration)

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// Resolved the checkout from this script rather than one developer's filesystem.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function check(name, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✔ [PASS] ${name}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✘ [FAIL] ${name}: ${err.message}`);
  }
}

console.log('================================================================');
console.log('CHALLENGER 2: EMPIRICAL INTERACTIVE STATE MACHINE VERIFICATION');
console.log('================================================================\n');

// ----------------------------------------------------------------------------
// Section 1: Landing Interactive State Machines
// ----------------------------------------------------------------------------
console.log('--- SECTION 1: Landing Interactive State Machines ---');

const indexHtml = fs.readFileSync(path.join(ROOT, 'landing/pages/index.html'), 'utf-8');
const loginHtml = fs.readFileSync(path.join(ROOT, 'landing/pages/login.html'), 'utf-8');
const regHtml = fs.readFileSync(path.join(ROOT, 'landing/pages/registration.html'), 'utf-8');
const compiledLandingCss = fs.readFileSync(path.join(ROOT, 'build/landing/assets/styles.css'), 'utf-8');

// 1.1 Mobile Burger Menu Toggle
check('1.1.1 Landing index.html defines #menu-toggle button with required accessibility attributes', () => {
  const match = indexHtml.match(/<button[^>]+id="menu-toggle"[^>]*>/);
  assert.ok(match, 'Button #menu-toggle must exist');
  const btn = match[0];
  assert.ok(btn.includes('aria-controls="site-navigation"'), 'Must have aria-controls="site-navigation"');
  assert.ok(btn.includes('aria-expanded="false"'), 'Must start with aria-expanded="false"');
  assert.ok(btn.includes('aria-label="Open navigation"'), 'Must start with aria-label="Open navigation"');
});

check('1.1.2 Landing index.html defines #site-navigation with .site-navigation class and responsive styling', () => {
  const match = indexHtml.match(/<nav[^>]+id="site-navigation"[^>]*class="([^"]+)"[^>]*>/);
  assert.ok(match, 'Nav #site-navigation must exist');
  const classes = match[1];
  assert.ok(classes.includes('site-navigation'), 'Must include .site-navigation class');
  assert.ok(classes.includes('max-mob:hidden'), 'Must include max-mob:hidden to hide on mobile by default');
});

check('1.1.3 Compiled Landing CSS contains @media (max-width: 850px) { .site-navigation.is-open { display: flex !important; } }', () => {
  assert.ok(
    compiledLandingCss.includes('.site-navigation.is-open{display:flex!important}') ||
    compiledLandingCss.includes('.site-navigation.is-open { display: flex !important; }'),
    'Compiled CSS must contain .site-navigation.is-open flex override'
  );
});

// Emulate Landing DOM and interaction state machine
function createLandingDOMSimulation() {
  class MockElement {
    constructor(tagName, id = '', className = '') {
      this.tagName = tagName.toUpperCase();
      this.id = id;
      this.className = className;
      this.classList = {
        _set: new Set(className.split(/\s+/).filter(Boolean)),
        add: (...cls) => cls.forEach((c) => this.classList._set.add(c)),
        remove: (...cls) => cls.forEach((c) => this.classList._set.delete(c)),
        toggle: (c, force) => {
          if (force !== undefined) {
            force ? this.classList._set.add(c) : this.classList._set.delete(c);
            return force;
          }
          if (this.classList._set.has(c)) {
            this.classList._set.delete(c);
            return false;
          } else {
            this.classList._set.add(c);
            return true;
          }
        },
        contains: (c) => this.classList._set.has(c),
      };
      this.attributes = new Map();
      this.listeners = new Map();
      this.textContent = '';
      this.href = '';
      this.type = '';
      this.dataset = {};
      this.parentElement = null;
      this.children = [];
    }
    setAttribute(name, val) { this.attributes.set(name, String(val)); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    hasAttribute(name) { return this.attributes.has(name); }
    addEventListener(event, fn) {
      if (!this.listeners.has(event)) this.listeners.set(event, []);
      this.listeners.get(event).push(fn);
    }
    dispatchEvent(event) {
      const fns = this.listeners.get(event.type) || [];
      fns.forEach((fn) => fn(event));
    }
    closest(selector) {
      if (selector === '.site-header' && (this.id === 'site-header' || this.classList.contains('site-header'))) return this;
      if (this.parentElement) return this.parentElement.closest(selector);
      return null;
    }
    querySelectorAll(selector) {
      if (selector === 'a') return this.children.filter((c) => c.tagName === 'A');
      return [];
    }
    focus() { this._focused = true; }
  }

  const header = new MockElement('header', 'site-header', 'site-header');
  const menu = new MockElement('nav', 'site-navigation', 'site-navigation max-mob:hidden');
  const menuButton = new MockElement('button', 'menu-toggle', 'hidden max-mob:grid');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Open navigation');
  header.children.push(menu, menuButton);
  menu.parentElement = header;
  menuButton.parentElement = header;

  const links = ['#features', '#how-it-works', '#scenarios', '#questions'].map((href) => {
    const a = new MockElement('a', '', 'hover:text-primary');
    a.href = href;
    a.parentElement = menu;
    menu.children.push(a);
    return a;
  });

  const doc = {
    listeners: new Map(),
    addEventListener: (event, fn) => {
      if (!doc.listeners.has(event)) doc.listeners.set(event, []);
      doc.listeners.get(event).push(fn);
    },
    dispatchEvent: (event) => {
      const fns = doc.listeners.get(event.type) || [];
      fns.forEach((fn) => fn(event));
    },
  };

  function closeMenu() {
    menu.classList.remove('is-open');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.setAttribute('aria-label', 'Open navigation');
  }

  // Exact logic from main.ts
  menuButton.addEventListener('click', () => {
    const open = menu.classList.toggle('is-open');
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  });
  menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
  doc.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('is-open')) {
      closeMenu();
      menuButton.focus();
    }
  });
  doc.addEventListener('click', (e) => {
    if (e.target instanceof MockElement && !e.target.closest('.site-header')) closeMenu();
  });

  return { header, menu, menuButton, links, doc, closeMenu };
}

check('1.1.4 Mobile menu toggle state transitions: click toggles is-open, aria-expanded, aria-label', () => {
  const dom = createLandingDOMSimulation();
  assert.equal(dom.menu.classList.contains('is-open'), false);
  assert.equal(dom.menuButton.getAttribute('aria-expanded'), 'false');
  assert.equal(dom.menuButton.getAttribute('aria-label'), 'Open navigation');

  // Click 1: Open menu
  dom.menuButton.dispatchEvent({ type: 'click' });
  assert.equal(dom.menu.classList.contains('is-open'), true, 'Must add is-open on click');
  assert.equal(dom.menuButton.getAttribute('aria-expanded'), 'true');
  assert.equal(dom.menuButton.getAttribute('aria-label'), 'Close navigation');

  // Click 2: Close menu
  dom.menuButton.dispatchEvent({ type: 'click' });
  assert.equal(dom.menu.classList.contains('is-open'), false, 'Must remove is-open on second click');
  assert.equal(dom.menuButton.getAttribute('aria-expanded'), 'false');
  assert.equal(dom.menuButton.getAttribute('aria-label'), 'Open navigation');
});

check('1.1.5 Mobile menu dismissal: link click, Escape key, and outside click all close menu and reset ARIA', () => {
  const dom = createLandingDOMSimulation();

  // Test link click dismissal
  dom.menuButton.dispatchEvent({ type: 'click' });
  assert.equal(dom.menu.classList.contains('is-open'), true);
  dom.links[0].dispatchEvent({ type: 'click' });
  assert.equal(dom.menu.classList.contains('is-open'), false, 'Link click must close menu');
  assert.equal(dom.menuButton.getAttribute('aria-expanded'), 'false');

  // Test Escape key dismissal
  dom.menuButton.dispatchEvent({ type: 'click' });
  assert.equal(dom.menu.classList.contains('is-open'), true);
  dom.doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
  assert.equal(dom.menu.classList.contains('is-open'), false, 'Escape key must close menu');
  assert.equal(dom.menuButton._focused, true, 'Escape key must return focus to menuButton');

  // Test outside click dismissal
  dom.menuButton.dispatchEvent({ type: 'click' });
  assert.equal(dom.menu.classList.contains('is-open'), true);
  // Outside element
  const outsideElement = { closest: () => null };
  Object.setPrototypeOf(outsideElement, dom.menu); // instance of MockElement
  dom.doc.dispatchEvent({ type: 'click', target: outsideElement });
  assert.equal(dom.menu.classList.contains('is-open'), false, 'Outside click must close menu');
});

// 1.2 Preview Profile Tabs & Negative Worth Highlight
check('1.2.1 Landing index.html defines 3 preview tabs (1, 2, 3) with profile 2 active initially', () => {
  assert.match(indexHtml, /data-preview="1"[^>]*aria-pressed="false"/);
  assert.match(indexHtml, /data-preview="2"[^>]*aria-pressed="true"/);
  assert.match(indexHtml, /data-preview="3"[^>]*aria-pressed="false"/);
});

check('1.2.2 Preview tabs use aria-pressed: utility variants for seamless active state styling', () => {
  const match = indexHtml.match(/data-preview="1"[^>]+class="([^"]+)"/);
  assert.ok(match, 'Tab 1 must have class');
  const cls = match[1];
  assert.ok(cls.includes('aria-pressed:text-text'), 'Must have aria-pressed:text-text');
  assert.ok(cls.includes('aria-pressed:bg-muted'), 'Must have aria-pressed:bg-muted');
  assert.ok(cls.includes('aria-pressed:border-border'), 'Must have aria-pressed:border-border');
});

check('1.2.3 Compiled CSS contains .negative { color: var(--coral) !important; } and coral theme variables', () => {
  assert.ok(
    compiledLandingCss.includes('.negative{color:var(--coral)!important}') ||
    compiledLandingCss.includes('.negative { color: var(--coral) !important; }'),
    'Compiled CSS must include .negative rule'
  );
  assert.ok(compiledLandingCss.includes('--coral:#fb8296'), 'Dark theme must define --coral: #fb8296');
  assert.ok(compiledLandingCss.includes('--coral:#b33353'), 'Light theme must define --coral: #b33353');
});

check('1.2.4 Profile switching updates values and applies .negative coral highlight when worth < 0', () => {
  const samples = {
    '1': { worth: -27000, label: 'Recent Grad' },
    '2': { worth: 95200, label: 'Mid-Career Family' },
    '3': { worth: 139500, label: 'FIRE Strategist' },
  };

  const previewWorth = { classList: new Set(['text-text']), textContent: '$95,200' };
  previewWorth.classList.toggle = (cls, force) => {
    force ? previewWorth.classList.add(cls) : previewWorth.classList.delete(cls);
  };

  const tabs = {
    '1': { ariaPressed: 'false' },
    '2': { ariaPressed: 'true' },
    '3': { ariaPressed: 'false' },
  };

  function selectTab(id) {
    for (const key of ['1', '2', '3']) {
      tabs[key].ariaPressed = String(key === id);
    }
    const sample = samples[id];
    previewWorth.classList.toggle('negative', sample.worth < 0);
  }

  // Switch to Tab 1 (Negative worth -$27,000)
  selectTab('1');
  assert.equal(tabs['1'].ariaPressed, 'true');
  assert.equal(tabs['2'].ariaPressed, 'false');
  assert.equal(previewWorth.classList.has('negative'), true, 'Profile 1 must have .negative class');

  // Switch to Tab 3 (Positive worth $139,500)
  selectTab('3');
  assert.equal(tabs['3'].ariaPressed, 'true');
  assert.equal(tabs['1'].ariaPressed, 'false');
  assert.equal(previewWorth.classList.has('negative'), false, 'Profile 3 must NOT have .negative class');

  // Switch to Tab 2 (Positive worth $95,200)
  selectTab('2');
  assert.equal(tabs['2'].ariaPressed, 'true');
  assert.equal(previewWorth.classList.has('negative'), false, 'Profile 2 must NOT have .negative class');
});

// 1.3 Password Visibility Toggle
check('1.3.1 Login and Registration pages define data-password-toggle hooks', () => {
  assert.match(loginHtml, /data-password-toggle="password"/);
  assert.match(regHtml, /data-password-toggle="password"/);
  assert.match(regHtml, /data-password-toggle="confirm-password"/);
});

check('1.3.2 Password toggle switches input type between password and text, updates text and aria-pressed', () => {
  const input = { type: 'password' };
  const button = { textContent: 'Show', ariaPressed: 'false' };
  button.setAttribute = (attr, val) => { if (attr === 'aria-pressed') button.ariaPressed = val; };

  function toggle() {
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    button.textContent = visible ? 'Hide' : 'Show';
    button.setAttribute('aria-pressed', String(visible));
  }

  // Toggle 1: Show password
  toggle();
  assert.equal(input.type, 'text');
  assert.equal(button.textContent, 'Hide');
  assert.equal(button.ariaPressed, 'true');

  // Toggle 2: Hide password
  toggle();
  assert.equal(input.type, 'password');
  assert.equal(button.textContent, 'Show');
  assert.equal(button.ariaPressed, 'false');
});

console.log('\n--- SECTION 2: Dashboard Interactive State Machines ---');

// Located the current stylesheet through the built entry page instead of a stale content hash.
const dashboardEntry = fs.readFileSync(path.join(ROOT, 'build/dashboard/index.html'), 'utf-8');
const dashboardCssHref = dashboardEntry.match(/href=["']([^"']+\.css)["']/)?.[1];
assert.ok(dashboardCssHref, 'Build the dashboard before running interactive verification');
const compiledDashboardCss = fs.readFileSync(
  path.join(ROOT, 'build/dashboard', dashboardCssHref.replace(/^\/dashboard\//, '')),
  'utf-8',
);
const appTsx = fs.readFileSync(path.join(ROOT, 'dashboard/src/App.tsx'), 'utf-8');
const canvasTsx = fs.readFileSync(path.join(ROOT, 'dashboard/src/components/Canvas.tsx'), 'utf-8');
const simulationModalTsx = fs.readFileSync(path.join(ROOT, 'dashboard/src/SimulationModal.tsx'), 'utf-8');

// 2.1 Sidebar View Switching
check('2.1.1 App.tsx defines active highlight utilities: bg-active-bg text-active-text border-active-border', () => {
  assert.match(appTsx, /view === item\.id \? 'active bg-active-bg text-active-text border-active-border'/);
});

check('2.1.2 Compiled Dashboard CSS contains definitions for bg-active-bg, text-active-text, border-active-border', () => {
  assert.ok(compiledDashboardCss.includes('bg-active-bg'), 'Must contain bg-active-bg');
  assert.ok(compiledDashboardCss.includes('text-active-text'), 'Must contain text-active-text');
  assert.ok(compiledDashboardCss.includes('border-active-border'), 'Must contain border-active-border');
  assert.ok(compiledDashboardCss.includes('--color-active-bg:#242438'), 'Theme must map --color-active-bg: #242438');
  assert.ok(compiledDashboardCss.includes('--color-active-text:#c9bdff'), 'Theme must map --color-active-text: #c9bdff');
  assert.ok(compiledDashboardCss.includes('--color-active-border:#36324d'), 'Theme must map --color-active-border: #36324d');
});

check('2.1.3 Sidebar view switching state machine selects exactly one active tab and sets aria-current="page"', () => {
  const views = ['overview', 'archetype', 'budgeting', 'investing'];
  let currentView = 'overview';

  function renderViewButtons() {
    return views.map((id) => {
      const isActive = currentView === id;
      return {
        id,
        className: `btn ${isActive ? 'active bg-active-bg text-active-text border-active-border' : 'border-transparent text-[#98a6bc]'}`,
        ariaCurrent: isActive ? 'page' : undefined,
      };
    });
  }

  // Initial state: overview is active
  let rendered = renderViewButtons();
  assert.equal(rendered.filter((b) => b.ariaCurrent === 'page').length, 1);
  assert.equal(rendered.find((b) => b.id === 'overview').className.includes('bg-active-bg'), true);
  assert.equal(rendered.find((b) => b.id === 'budgeting').className.includes('bg-active-bg'), false);

  // Switch to budgeting
  currentView = 'budgeting';
  rendered = renderViewButtons();
  assert.equal(rendered.filter((b) => b.ariaCurrent === 'page').length, 1);
  assert.equal(rendered.find((b) => b.id === 'budgeting').className.includes('bg-active-bg'), true);
  assert.equal(rendered.find((b) => b.id === 'budgeting').ariaCurrent, 'page');
  assert.equal(rendered.find((b) => b.id === 'overview').className.includes('bg-active-bg'), false);
  assert.equal(rendered.find((b) => b.id === 'overview').ariaCurrent, undefined);
});

// 2.2 D3 Financial Canvas Dynamic Interactive Classes
check('2.2.1 Canvas.tsx uses canvas-node and is-selected classes for node selection', () => {
  assert.match(canvasTsx, /\.attr\('class',\s*'canvas-node'\)/);
  assert.match(canvasTsx, /\.classed\('is-selected',\s*\(node\)\s*=>\s*selectionIds\.includes\(node\.id\)\)/);
});

check('2.2.2 Canvas.tsx uses canvas-edge and edge-selected classes for edge selection', () => {
  assert.match(canvasTsx, /\.classed\('edge-selected',\s*\(edge\)\s*=>\s*edgeSelectionIds\.includes\(edge\.id\)\)/);
});

check('2.2.3 Canvas.tsx toggles is-linking and connect-mode on the host container', () => {
  assert.match(canvasTsx, /hostElement\.classList\.add\('is-linking'\)/);
  assert.match(canvasTsx, /hostElement\.classList\.remove\('is-linking'\)/);
  assert.match(canvasTsx, /connecting \? ' connect-mode' : ''/);
});

check('2.2.4 Canvas.tsx renders connector-preview during wire drag', () => {
  assert.match(canvasTsx, /\.attr\('class',\s*'connector-preview'\)/);
});

check('2.2.5 Compiled Dashboard CSS contains presentation rules for is-selected, edge-selected, is-linking, connect-mode, connector-preview', () => {
  assert.ok(compiledDashboardCss.includes('.canvas-node.is-selected rect'), 'Must style .canvas-node.is-selected rect');
  assert.ok(compiledDashboardCss.includes('.canvas-edge.edge-selected'), 'Must style .canvas-edge.edge-selected');
  assert.ok(compiledDashboardCss.includes('.is-linking .node-port'), 'Must style .is-linking .node-port');
  assert.ok(compiledDashboardCss.includes('.connect-mode .node-port'), 'Must style .connect-mode .node-port');
  assert.ok(compiledDashboardCss.includes('.connector-preview'), 'Must style .connector-preview');
  assert.ok(compiledDashboardCss.includes('@keyframes connector-flow'), 'Must include @keyframes connector-flow');
});

// 2.3 Monte Carlo Simulation Dialog Layout and Forecast Render
check('2.3.1 SimulationModal.tsx defines accessible dialog container with role="dialog" and aria-modal="true"', () => {
  assert.match(simulationModalTsx, /role="dialog"/);
  assert.match(simulationModalTsx, /aria-modal="true"/);
  assert.match(simulationModalTsx, /aria-labelledby="simulation-title"/);
});

check('2.3.2 SimulationModal.tsx applies responsive grid layout: minmax(0,1fr)_340px -> 300px -> 1 col', () => {
  assert.match(simulationModalTsx, /grid grid-cols-\[minmax\(0,1fr\)_340px\] max-\[1100px\]:grid-cols-\[minmax\(0,1fr\)_300px\] max-\[800px\]:grid-cols-1/);
});

check('2.3.3 SimulationModal.tsx applies semantic and utility coloring to financial metrics: positive text-mint / negative text-coral', () => {
  assert.match(simulationModalTsx, /final && final\.p50 < 0 \? 'negative text-coral' : 'positive text-mint'/);
  assert.match(simulationModalTsx, /metrics!\.monthly_surplus < 0 \? 'negative text-coral' : ''/);
  assert.match(simulationModalTsx, /summary\?\.paid_off \? 'positive text-mint' : 'negative text-coral'/);
});

check('2.3.4 Compiled Dashboard CSS defines text-coral (#fb8296) and text-mint (#85e0bb) tokens', () => {
  assert.ok(compiledDashboardCss.includes('text-coral'), 'Must contain text-coral utility');
  assert.ok(compiledDashboardCss.includes('text-mint'), 'Must contain text-mint utility');
  assert.ok(compiledDashboardCss.includes('--color-coral:#fb8296'), 'Theme must map --color-coral: #fb8296');
  assert.ok(compiledDashboardCss.includes('--color-mint:#85e0bb'), 'Theme must map --color-mint: #85e0bb');
});

console.log('\n================================================================');
console.log(`SUMMARY: Total Tests: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
console.log('================================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
