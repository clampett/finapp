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

test('User Story 34: BudgetingTab renames Transactions tab to Assets/Transactions', () => {
  const fs = require('node:fs');
  const budgetingTsx = fs.readFileSync(
    path.join(__dirname, '../../dashboard/src/views/BudgetingTab.tsx'),
    'utf8',
  );
  assert.match(budgetingTsx, /Assets\/Transactions\s*\(\{transactions\.length\}\)/);
  assert.doesNotMatch(budgetingTsx, />\s*Transactions\s*\(\{transactions\.length\}\)/);
});

test('User Story 34: TransactionSection has Add Asset with AI button to the left of Add Asset/Transaction', () => {
  const fs = require('node:fs');
  const sectionTsx = fs.readFileSync(
    path.join(__dirname, '../../dashboard/src/budgeting/TransactionSection.tsx'),
    'utf8',
  );
  assert.match(sectionTsx, /Recorded Assets\/Transactions/);
  assert.match(sectionTsx, /\+\s*Add Asset\/Transaction/);
  assert.match(sectionTsx, /Add Asset with AI/);

  // Verify Value Asset button precedes Add Asset/Transaction in markup
  const aiButtonIndex = sectionTsx.indexOf('Add Asset with AI');
  const addTxnIndex = sectionTsx.indexOf('+ Add Asset/Transaction');
  assert.ok(aiButtonIndex !== -1, 'Add Asset with AI button must exist');
  assert.ok(addTxnIndex !== -1, '+ Add Asset/Transaction button must exist');
  assert.ok(
    aiButtonIndex < addTxnIndex,
    'Add Asset with AI button must be positioned to the left of + Add Asset/Transaction',
  );

  // Verify both buttons share the same primary styling classes
  assert.match(
    sectionTsx,
    /<button[^>]*bg-primary text-primary-fg[^>]*>\s*✨ Add Asset with AI\s*<\/button>/,
  );
});

test('User Story 34: AiAssetModal prompts for asset description and mirrors TransactionModal fields', () => {
  const fs = require('node:fs');
  const aiModalTsx = fs.readFileSync(
    path.join(__dirname, '../../dashboard/src/budgeting/AiAssetModal.tsx'),
    'utf8',
  );
  assert.match(aiModalTsx, /Value Asset with Local AI/);
  assert.match(aiModalTsx, /Describe your asset/);
  assert.match(aiModalTsx, /\/api\/v1\/coach\/value-asset/);
  assert.match(aiModalTsx, /Approve Asset\/Transaction/);

  // Check that all required fields from TransactionModal are present
  assert.match(aiModalTsx, /transDraft\.kind/);
  assert.match(aiModalTsx, /transDraft\.description/);
  assert.match(aiModalTsx, /transDraft\.amount/);
  assert.match(aiModalTsx, /transDraft\.accountName/);
  assert.match(aiModalTsx, /transDraft\.transactionDate/);
  assert.match(aiModalTsx, /transDraft\.categoryName/);
  assert.match(aiModalTsx, /transDraft\.notes/);
});
