const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { transformSync } = require('./landing/node_modules/esbuild');
const source = transformSync(
  fs.readFileSync(path.join(__dirname, 'dashboard/src/session.ts'), 'utf8'),
  { loader: 'ts', format: 'cjs' },
).code;
function browser(initial = {}) {
  const values = new Map(Object.entries(initial));
  const listeners = {};
  const root = { style: { visibility: '' } };
  const calls = [],
    redirects = [];
  const sandbox = {
    module: { exports: {} },
    AbortSignal,
    Promise,
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      removeItem: (key) => values.delete(key),
    },
    window: {
      addEventListener: (name, handler) => {
        listeners[name] = handler;
      },
    },
    document: { getElementById: () => root },
    location: { replace: (url) => redirects.push(url) },
    fetch: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, json: async () => ({ userId: 4 }) };
    },
  };
  vm.runInNewContext(source, sandbox);
  return { session: sandbox.module.exports, values, listeners, root, calls, redirects };
}
const signedIn = { finapp_user_id: '4', finapp_session_token: 'tab-secret' };
test('leaving for a public page clears tab identity immediately and revokes backend session', async () => {
  const b = browser(signedIn);
  const logout = b.session.endSession();
  assert.equal(b.values.size, 0);
  await logout;
  assert.equal(b.calls[0].url, '/api/v1/auth/logout');
  assert.deepEqual(JSON.parse(b.calls[0].options.body), { sessionToken: 'tab-secret' });
  assert.equal(b.calls[0].options.keepalive, true);
});
test('a fresh tab cannot use an old cookie without the closed tabs key', async () => {
  const b = browser();
  assert.equal(await b.session.validSession(), false);
  assert.equal(b.calls.length, 0);
});
test('Back then Forward cannot reopen a signed-out cached dashboard', async () => {
  const b = browser(signedIn);
  b.session.installPrivateSessionGuard();
  b.listeners.pagehide({ persisted: true });
  assert.equal(b.root.style.visibility, 'hidden');
  await b.session.endSession();
  await b.listeners.pageshow({ persisted: true });
  assert.deepEqual(b.redirects, ['/login']);
  assert.equal(b.root.style.visibility, 'hidden');
});
test('refresh/navigation snapshot keeps the active tab key and validates before revealing cached UI', async () => {
  const b = browser(signedIn);
  b.session.installPrivateSessionGuard();
  b.listeners.pagehide({ persisted: false });
  assert.equal(b.values.get('finapp_session_token'), 'tab-secret');
  await b.listeners.pageshow({ persisted: true });
  assert.equal(b.root.style.visibility, '');
  assert.equal(b.calls[0].options.headers['X-FinApp-Session'], 'tab-secret');
  assert.deepEqual(b.redirects, []);
});
