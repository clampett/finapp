const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../dashboard/node_modules/typescript');

function renderedClasses(file, marker, state) {
  const source = fs.readFileSync(path.join(__dirname, '../dashboard/src', file), 'utf8');
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText(tree) === 'className' &&
      node.initializer &&
      ts.isJsxExpression(node.initializer) &&
      node.initializer.expression?.getText(tree).includes(marker)
    ) {
      expression = node.initializer.expression.getText(tree);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(expression, `Expected the actual ${marker} class expression in ${file}`);
  // Evaluated the component's actual class expression rather than a copied approximation.
  return new Set(vm.runInNewContext(expression, state).split(/\s+/));
}

test('selected navigation never combined its active color with transparent defaults', () => {
  const active = renderedClasses('App.tsx', 'bg-active-bg', {
    view: 'graph',
    item: { id: 'graph' },
  });
  assert.ok(active.has('bg-active-bg'));
  assert.ok(active.has('border-active-border'));
  assert.ok(!active.has('bg-transparent'));
  assert.ok(!active.has('border-transparent'));
  assert.ok(!active.has('hover:bg-hover-bg'));
  const inactive = renderedClasses('App.tsx', 'bg-active-bg', {
    view: 'overview',
    item: { id: 'graph' },
  });
  assert.ok(inactive.has('bg-transparent'));
  assert.ok(!inactive.has('bg-active-bg'));
});

test('fullscreen fallback selected viewport geometry without normal-canvas overrides', () => {
  const expanded = renderedClasses('components/Canvas.tsx', 'canvas-host', {
    expanded: true,
    tool: 'select',
    connecting: false,
  });
  for (const name of ['fixed', 'inset-0', 'h-dvh', 'min-h-0', 'border-0', 'rounded-none']) {
    assert.ok(expanded.has(name), `Missing fullscreen ${name}`);
  }
  for (const name of [
    'relative',
    'min-h-127.5',
    'rounded-xl',
    'border',
    'h-[clamp(510px,62vh,760px)]',
  ]) {
    assert.ok(!expanded.has(name), `Conflicting fullscreen ${name}`);
  }
  const normal = renderedClasses('components/Canvas.tsx', 'canvas-host', {
    expanded: false,
    tool: 'select',
    connecting: false,
  });
  assert.ok(normal.has('relative'));
  assert.ok(!normal.has('fixed'));
  assert.ok(normal.has('h-[clamp(510px,62vh,760px)]'));
});
