const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { buildSync } = require('../../landing/node_modules/esbuild/lib/main');
const runtime = { module: { exports: {} }, crypto: webcrypto };
vm.runInNewContext(
  buildSync({
    entryPoints: [path.join(__dirname, '../../dashboard/src/assets/personal-assets.ts')],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    define: { 'import.meta.env.VITE_API_URL': '""' },
  }).outputFiles[0].text,
  runtime,
);
const { savePersonalAsset } = runtime.module.exports;

test('revalued one property account without duplication or changing its original position', () => {
  const added = savePersonalAsset({ nodes: [], edges: [] }, 'Car', 15000, -10);
  const existing = added.nodes[0];
  const revised = savePersonalAsset(added, 'Car', 14000, -12, existing.id);
  assert.equal(revised.nodes.length, 1);
  assert.equal(revised.nodes[0].amountOrBalance, 14000);
  assert.equal(revised.nodes[0].assetGrowthRate, -12);
  assert.deepEqual(revised.nodes[0].position, existing.position);
  assert.equal(added.nodes[0].amountOrBalance, 15000, 'Prior undo snapshot was mutated');
  assert.throws(() => savePersonalAsset(added, 'Missing', 100, 0, 'missing'), /no longer exists/);
  assert.throws(() => savePersonalAsset(added, 'Invalid', NaN, 0));
});
