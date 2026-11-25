const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { buildSync } = require('../../landing/node_modules/esbuild');
const runtime = { module: { exports: {} } };
vm.runInNewContext(
  buildSync({
    entryPoints: [path.join(__dirname, '../../dashboard/src/budgeting/budgeting-drafts.ts')],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
  }).outputFiles[0].text,
  runtime,
);
const { changeAccount, changeCategory, changeKind } = runtime.module.exports;

test('editing an account replaced the saved ID rather than retaining the previous account', () => {
  const result = changeAccount({ accountId: 1, accountName: 'Checking' }, 'Savings', [
    { id: 2, name: 'Savings' },
  ]);
  assert.equal(result.accountId, 2);
  assert.equal(result.accountName, 'Savings');
  assert.equal(changeAccount(result, 'New account', []).accountId, null);
});

test('the Checking display alias retained its actual database account ID', () => {
  const result = changeAccount({}, 'Checking', [{ id: 9, name: 'Checking Account' }]);
  assert.equal(result.accountId, 9);
  assert.equal(result.accountName, 'Checking');
});

test('editing category text cleared the old category ID', () => {
  const result = changeCategory({ categoryId: 4, categoryName: 'Rent' }, 'Groceries');
  assert.equal(result.categoryId, null);
  assert.equal(result.categoryName, 'Groceries');
});

test('changing income/expense kind cleared the incompatible category', () => {
  const result = changeKind({ kind: 'expense', categoryId: 4, categoryName: 'Rent' }, 'income');
  assert.equal(result.kind, 'income');
  assert.equal(result.categoryId, null);
  assert.equal(result.categoryName, '');
});

// Checked the estimate response contract independently of mutable budget transaction drafts.
const estimateRuntime = { module: { exports: {} } };
vm.runInNewContext(
  buildSync({
    entryPoints: [path.join(__dirname, '../../dashboard/src/budgeting/asset-estimate.ts')],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
  }).outputFiles[0].text,
  estimateRuntime,
);
test('asset estimate responses required bounded values and honest provenance', () => {
  const valid = {
    description: 'Car',
    amount: 15000,
    categoryName: 'Vehicles',
    source: 'local_ai',
    notes: 'Illustrative only',
    currency: 'USD',
    verified: false,
  };
  const accepts = estimateRuntime.module.exports.isAssetEstimate;
  assert.equal(accepts(valid), true);
  assert.equal(accepts({ ...valid, amount: null, source: 'unavailable' }), true);
  for (const changed of [
    { amount: Infinity },
    { amount: -100 },
    { amount: 1e12 },
    { verified: true },
    { source: 'live_market' },
    { categoryName: { bad: true } },
    { notes: { bad: true } },
  ])
    assert.equal(accepts({ ...valid, ...changed }), false);
});
