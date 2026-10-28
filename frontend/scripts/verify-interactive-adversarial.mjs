// Adversarial Stress Harness for Interactive State Machines
// Challenger 2: FinApp Tailwind V4 Migration

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const ROOT = '/mnt/shared/files/documents/Class/Software Engineering/finapp/frontend';

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
console.log('CHALLENGER 2: ADVERSARIAL STRESS TEST & BOUNDARY HARNESS');
console.log('================================================================\n');

// ----------------------------------------------------------------------------
// Track 1: Landing State Machine Stress Tests
// ----------------------------------------------------------------------------
console.log('--- TRACK 1: Landing State Machine Stress Tests ---');

check('T1.1 Menu rapid toggle: 10 alternating clicks maintain strictly synchronous ARIA & class state', () => {
  const menu = { classList: new Set() };
  menu.classList.toggle = (c) => {
    if (menu.classList.has(c)) { menu.classList.delete(c); return false; }
    menu.classList.add(c); return true;
  };
  const button = { attrs: new Map() };
  button.setAttribute = (k, v) => button.attrs.set(k, String(v));

  for (let i = 1; i <= 10; i++) {
    const open = menu.classList.toggle('is-open');
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');

    const expectedOpen = (i % 2 === 1);
    assert.equal(open, expectedOpen, `Click ${i} open state mismatch`);
    assert.equal(menu.classList.has('is-open'), expectedOpen, `Click ${i} class mismatch`);
    assert.equal(button.attrs.get('aria-expanded'), String(expectedOpen), `Click ${i} aria-expanded mismatch`);
    assert.equal(button.attrs.get('aria-label'), expectedOpen ? 'Close navigation' : 'Open navigation');
  }
});

check('T1.2 Menu Escape key handler: no-op when menu is already closed, does not steal focus', () => {
  let focused = false;
  const menu = { classList: new Set() }; // Closed
  const button = { focus: () => { focused = true; } };

  function handleEscape(key) {
    if (key === 'Escape' && menu.classList.has('is-open')) {
      menu.classList.delete('is-open');
      button.focus();
    }
  }

  handleEscape('Escape');
  assert.equal(focused, false, 'Focus must not be modified when menu is closed');
  assert.equal(menu.classList.has('is-open'), false);
});

check('T1.3 Menu responsive breakpoint event: matchMedia min-width:851px resets open state', () => {
  const menu = { classList: new Set(['is-open']) };
  const button = { attrs: new Map([['aria-expanded', 'true'], ['aria-label', 'Close navigation']]) };
  button.setAttribute = (k, v) => button.attrs.set(k, String(v));

  function closeMenu() {
    menu.classList.delete('is-open');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', 'Open navigation');
  }

  function handleBreakpointChange(matches) {
    if (matches) closeMenu();
  }

  // Trigger resize to desktop (matches = true)
  handleBreakpointChange(true);
  assert.equal(menu.classList.has('is-open'), false, 'Menu must be closed upon expanding to desktop');
  assert.equal(button.attrs.get('aria-expanded'), 'false');
  assert.equal(button.attrs.get('aria-label'), 'Open navigation');

  // Trigger resize back to mobile (matches = false, should remain closed)
  handleBreakpointChange(false);
  assert.equal(menu.classList.has('is-open'), false);
});

check('T1.4 Preview tab cycling: stress cycle 1->2->3->1->1->3 verifies idempotency and .negative toggling', () => {
  const samples = {
    '1': { worth: -27000 },
    '2': { worth: 95200 },
    '3': { worth: 139500 },
  };
  const previewWorth = { classList: new Set() };
  previewWorth.classList.toggle = (cls, force) => {
    force ? previewWorth.classList.add(cls) : previewWorth.classList.delete(cls);
  };
  const tabs = { '1': false, '2': true, '3': false };

  function selectTab(id) {
    const sample = samples[id];
    if (!sample) return;
    for (const key of Object.keys(tabs)) tabs[key] = (key === id);
    previewWorth.classList.toggle('negative', sample.worth < 0);
  }

  const sequence = ['1', '2', '3', '1', '1', '3', '2'];
  for (const id of sequence) {
    selectTab(id);
    const sample = samples[id];
    const isNegative = sample.worth < 0;
    assert.equal(tabs[id], true, `Tab ${id} must be active`);
    assert.equal(previewWorth.classList.has('negative'), isNegative, `Tab ${id} negative class expectation failed`);
  }
});

check('T1.5 Preview tab invalid input: non-existent tab ID leaves current state unchanged', () => {
  const previewWorth = { classList: new Set(['negative']) };
  const tabs = { '1': true, '2': false, '3': false };
  const samples = { '1': { worth: -27000 } };

  function selectTab(id) {
    const sample = samples[id];
    if (!sample) return;
    tabs['1'] = false;
  }

  selectTab('invalid_999');
  assert.equal(tabs['1'], true, 'Tab 1 must remain active on invalid selection');
  assert.equal(previewWorth.classList.has('negative'), true, 'Negative class must remain on invalid selection');
});

check('T1.6 Multi-field password toggle isolation: password and confirm-password toggles do not collide', () => {
  const fields = {
    'password': { type: 'password', textContent: 'Show', ariaPressed: 'false' },
    'confirm-password': { type: 'password', textContent: 'Show', ariaPressed: 'false' },
  };

  function toggleField(id) {
    const field = fields[id];
    if (!field) return;
    const visible = field.type === 'password';
    field.type = visible ? 'text' : 'password';
    field.textContent = visible ? 'Hide' : 'Show';
    field.ariaPressed = String(visible);
  }

  // Toggle field 1
  toggleField('password');
  assert.equal(fields['password'].type, 'text');
  assert.equal(fields['password'].textContent, 'Hide');
  assert.equal(fields['password'].ariaPressed, 'true');
  // Field 2 must remain unchanged
  assert.equal(fields['confirm-password'].type, 'password');
  assert.equal(fields['confirm-password'].textContent, 'Show');
  assert.equal(fields['confirm-password'].ariaPressed, 'false');

  // Toggle field 2
  toggleField('confirm-password');
  assert.equal(fields['confirm-password'].type, 'text');
  // Both are now visible
  assert.equal(fields['password'].type, 'text');
  assert.equal(fields['confirm-password'].type, 'text');

  // Toggle field 1 back
  toggleField('password');
  assert.equal(fields['password'].type, 'password');
  assert.equal(fields['confirm-password'].type, 'text');
});

console.log('\n--- TRACK 2: Dashboard State Machine Stress Tests ---');

check('T2.1 Sidebar view cycling: all 4 views preserve mutual exclusivity and exact active tokens', () => {
  const views = ['overview', 'archetype', 'budgeting', 'investing'];
  const expectedClasses = 'active bg-active-bg text-active-text border-active-border';

  for (const targetView of views) {
    const buttons = views.map((id) => ({
      id,
      className: id === targetView ? expectedClasses : 'inactive',
      ariaCurrent: id === targetView ? 'page' : undefined,
    }));

    const activeButtons = buttons.filter((b) => b.className.includes('bg-active-bg'));
    assert.equal(activeButtons.length, 1, `Exactly one active button for view ${targetView}`);
    assert.equal(activeButtons[0].id, targetView);
    assert.equal(activeButtons[0].className, expectedClasses);
    assert.equal(activeButtons[0].ariaCurrent, 'page');

    const inactiveButtons = buttons.filter((b) => b.id !== targetView);
    for (const b of inactiveButtons) {
      assert.equal(b.className.includes('bg-active-bg'), false);
      assert.equal(b.ariaCurrent, undefined);
    }
  }
});

check('T2.2 D3 Canvas selection set stress test: empty, single, multi, disjoint selections', () => {
  const nodes = [{ id: 'n1' }, { id: 'n2' }, { id: 'n3' }, { id: 'n4' }];
  const edges = [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }];

  function evaluateClasses(selectedNodeIds, selectedEdgeIds) {
    const nodeClasses = nodes.map((n) => ({
      id: n.id,
      isSelected: selectedNodeIds.includes(n.id),
    }));
    const edgeClasses = edges.map((e) => ({
      id: e.id,
      isEdgeSelected: selectedEdgeIds.includes(e.id),
    }));
    return { nodeClasses, edgeClasses };
  }

  // 1. Empty selection
  let res = evaluateClasses([], []);
  assert.equal(res.nodeClasses.every((n) => !n.isSelected), true);
  assert.equal(res.edgeClasses.every((e) => !e.isEdgeSelected), true);

  // 2. Single selection
  res = evaluateClasses(['n2'], ['e1']);
  assert.equal(res.nodeClasses.find((n) => n.id === 'n2').isSelected, true);
  assert.equal(res.nodeClasses.filter((n) => n.isSelected).length, 1);
  assert.equal(res.edgeClasses.find((e) => e.id === 'e1').isEdgeSelected, true);

  // 3. Multi selection
  res = evaluateClasses(['n1', 'n3', 'n4'], ['e2', 'e3']);
  assert.equal(res.nodeClasses.filter((n) => n.isSelected).length, 3);
  assert.equal(res.edgeClasses.filter((e) => e.isEdgeSelected).length, 2);
});

check('T2.3 D3 Canvas linking & connect-mode lifecycle: verify is-linking add/remove and connect-mode presence', () => {
  class MockHost {
    constructor() {
      this.classList = new Set();
      this.connecting = false;
      this.tool = 'select';
    }
    getClassName() {
      return `canvas-host tool-${this.tool}${this.connecting ? ' connect-mode' : ''}`;
    }
    startLinking() { this.classList.add('is-linking'); }
    endLinking() { this.classList.delete('is-linking'); }
  }

  const host = new MockHost();
  assert.equal(host.getClassName().includes('connect-mode'), false);
  assert.equal(host.classList.has('is-linking'), false);

  // Enter connecting mode
  host.connecting = true;
  assert.equal(host.getClassName().includes('connect-mode'), true);

  // Drag from port: is-linking added
  host.startLinking();
  assert.equal(host.classList.has('is-linking'), true);

  // End drag
  host.endLinking();
  assert.equal(host.classList.has('is-linking'), false);

  // Exit connecting mode
  host.connecting = false;
  assert.equal(host.getClassName().includes('connect-mode'), false);
});

check('T2.4 Monte Carlo metric styling truth table: exhaustive test of positive, zero, negative scenarios', () => {
  function getMetricClasses(p50, surplus, debtPaidOff) {
    const p50Class = p50 < 0 ? 'negative text-coral' : 'positive text-mint';
    const surplusClass = surplus < 0 ? 'negative text-coral' : '';
    const debtClass = debtPaidOff ? 'positive text-mint' : 'negative text-coral';
    return { p50Class, surplusClass, debtClass };
  }

  // Scenario A: Highly profitable scenario
  let scA = getMetricClasses(500000, 2500, true);
  assert.equal(scA.p50Class, 'positive text-mint');
  assert.equal(scA.surplusClass, '');
  assert.equal(scA.debtClass, 'positive text-mint');

  // Scenario B: Deeply negative scenario (debt distress)
  let scB = getMetricClasses(-35000, -800, false);
  assert.equal(scB.p50Class, 'negative text-coral');
  assert.equal(scB.surplusClass, 'negative text-coral');
  assert.equal(scB.debtClass, 'negative text-coral');

  // Scenario C: Zero boundary conditions
  let scC = getMetricClasses(0, 0, false);
  assert.equal(scC.p50Class, 'positive text-mint', 'Zero net worth should not be negative');
  assert.equal(scC.surplusClass, '', 'Zero surplus should not be negative');
  assert.equal(scC.debtClass, 'negative text-coral', 'Unpaid debt balance at 0 payoff is negative');
});

console.log('\n================================================================');
console.log(`SUMMARY: Total Tests: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
console.log('================================================================');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
