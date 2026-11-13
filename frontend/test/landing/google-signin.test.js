const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('../../landing/node_modules/esbuild/lib/main');

const compile = (name) =>
  transformSync(fs.readFileSync(path.join(__dirname, '../../landing/src/ts', name), 'utf8'), {
    loader: 'ts',
    format: 'cjs',
  }).code;
const flush = () => new Promise((resolve) => setImmediate(resolve));

function element() {
  return {
    value: '',
    textContent: '',
    hidden: true,
    disabled: false,
    inert: false,
    events: {},
    addEventListener(name, handler) {
      this.events[name] = handler;
    },
    replaceChildren() {},
    getBoundingClientRect: () => ({ width: 350 }),
    reportValidity: () => true,
  };
}

function googlePage({ sdk = true, enabled = true } = {}) {
  const nodes = new Map(
    ['google-signin-btn', 'google-status', 'google-error', 'google-retry'].map((id) => [
      id,
      element(),
    ]),
  );
  const rendered = [];
  const scripts = [];
  const lifecycle = {};
  let configuration;
  const identity = {
    initialize: (config) => {
      configuration = config;
    },
    renderButton: (container, options) => rendered.push({ container, options }),
    disableAutoSelect() {},
  };
  const sandbox = {
    module: { exports: {} },
    require: () => ({ finishLogout: async () => {} }),
    AbortController,
    AbortSignal,
    ResizeObserver: class {
      observe() {}
    },
    MutationObserver: class {
      observe() {}
    },
    fetch: async () => ({
      ok: true,
      json: async () => ({ enabled, clientId: 'server-client-id', nonce: 'browser-challenge' }),
    }),
    document: {
      documentElement: { dataset: { theme: 'dark' } },
      getElementById: (id) => nodes.get(id),
      createElement: () => ({ remove() {} }),
      head: { append: (script) => scripts.push(script) },
    },
    window: {
      google: sdk ? { accounts: { id: identity } } : undefined,
      setTimeout: () => 1,
      clearTimeout() {},
      addEventListener: (name, callback) => {
        lifecycle[name] = callback;
      },
    },
  };
  vm.runInNewContext(compile('google-signin.ts'), sandbox);
  const credentials = [];
  sandbox.module.exports.setupGoogleSignIn(async (token) => credentials.push(token));
  return {
    nodes,
    rendered,
    scripts,
    lifecycle,
    sandbox,
    identity,
    credentials,
    config: () => configuration,
  };
}

test('Google used backend configuration and a visible button on an empty form', async () => {
  const page = googlePage();
  await flush();
  assert.equal(page.config().client_id, 'server-client-id');
  assert.equal(page.config().nonce, 'browser-challenge');
  assert.equal(page.config().auto_select, false);
  assert.equal(page.rendered[0].container, page.nodes.get('google-signin-btn'));
  assert.equal(page.rendered[0].options.width, 350);
  page.config().callback({ credential: 'signed-credential' });
  await flush();
  assert.deepEqual(page.credentials, ['signed-credential']);
});

test('a blocked Google SDK showed retry and a late SDK load could recover', async () => {
  const page = googlePage({ sdk: false });
  await flush();
  page.scripts[0].onerror();
  await flush();
  assert.match(page.nodes.get('google-error').textContent, /could not load/);
  assert.equal(page.nodes.get('google-retry').hidden, false);
  page.nodes.get('google-retry').events.click();
  await flush();
  page.sandbox.window.google = { accounts: { id: page.identity } };
  page.scripts[1].onload();
  await flush();
  assert.equal(page.rendered.length, 1);
  assert.equal(page.nodes.get('google-error').textContent, '');
});

test('unconfigured Google sign-in left a clear fallback and no external script request', async () => {
  const page = googlePage({ enabled: false });
  await flush();
  assert.match(page.nodes.get('google-status').textContent, /FinApp username/);
  assert.equal(page.scripts.length, 0);
  assert.equal(page.rendered.length, 0);
});

function signInPage({ register = false, storageBlocked = false, request } = {}) {
  const ids = [
    register ? 'registration-form' : 'login-form',
    register ? 'register_button' : 'login_button',
    'username',
    'password',
    'confirm-password',
    'email',
    'google-signin-btn',
    'google-status',
    'google-error',
    'google-retry',
    'registration-error',
    'login-error',
  ];
  const nodes = new Map(ids.map((id) => [id, element()]));
  nodes.get('username').value = 'new-user';
  nodes.get('password').value = 'safe-test-password';
  nodes.get('confirm-password').value = 'safe-test-password';
  nodes.get('email').value = 'new-user@example.com';
  const store = new Map();
  const redirects = [];
  const calls = [];
  const lifecycle = {};
  let googleCallback;
  const sandbox = {
    module: { exports: {} },
    AbortController,
    URLSearchParams,
    TextEncoder,
    require: (name) => {
      if (name.includes('google-signin'))
        return {
          setupGoogleSignIn: (callback) => {
            googleCallback = callback;
          },
        };
      if (name.includes('session')) return { clearSession: () => store.clear() };
      return {
        AuthError: class extends Error {},
        formError: (error) => error.message,
        authRequest: async (route, body) => {
          calls.push({ route, body });
          return request ? request(route, body) : { userId: 25, sessionToken: 'tab-key' };
        },
      };
    },
    document: {
      getElementById: (id) => nodes.get(id) ?? null,
      querySelectorAll: () => [],
    },
    location: { search: '', assign: (url) => redirects.push(url) },
    window: {
      addEventListener: (name, callback) => {
        lifecycle[name] = callback;
      },
    },
    sessionStorage: {
      setItem: (key, value) => {
        if (storageBlocked && key === 'finapp_user_id') throw new Error('Storage denied');
        store.set(key, value);
      },
    },
  };
  vm.runInNewContext(compile('login.ts'), sandbox);
  return { nodes, calls, store, redirects, lifecycle, google: (token) => googleCallback(token) };
}

test('Google signup opened the dashboard without requiring password form fields', async () => {
  const page = signInPage({ register: true });
  page.nodes.get('password').value = '';
  await page.google('google-credential');
  assert.equal(page.calls[0].route, 'google');
  assert.equal(page.store.get('finapp_session_token'), 'tab-key');
  assert.equal(page.store.get('finapp_user_id'), '25');
  assert.deepEqual(page.redirects, ['/dashboard/']);
});

test('Google failure restored the password signup form and displayed a retry', async () => {
  const page = signInPage({
    register: true,
    request: async () => {
      throw new Error('Google credential expired');
    },
  });
  await page.google('expired');
  assert.equal(page.nodes.get('register_button').disabled, false);
  assert.equal(page.nodes.get('google-signin-btn').inert, false);
  assert.match(page.nodes.get('google-error').textContent, /expired/);
  assert.equal(page.nodes.get('google-retry').hidden, false);
});

test('a storage failure revoked the Google session and cleared partially saved identity', async () => {
  const page = signInPage({ storageBlocked: true });
  await page.google('credential');
  assert.equal(page.calls[1].route, 'logout');
  assert.equal(page.calls[1].body.sessionToken, 'tab-key');
  assert.equal(page.store.size, 0);
  assert.deepEqual(page.redirects, []);
});

test('Google and password submission shared one pending request', async () => {
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const page = signInPage({ request: () => pending });
  const first = page.google('credential');
  await page.google('duplicate');
  await page.nodes.get('login-form').events.submit({ preventDefault() {} });
  assert.equal(page.calls.length, 1);
  finish({ userId: 25, sessionToken: 'tab-key' });
  await first;
});

test('password signup still continued to the existing email verification page', async () => {
  const page = signInPage({ register: true });
  await page.nodes.get('registration-form').events.submit({ preventDefault() {} });
  assert.equal(page.calls[0].route, 'register');
  assert.deepEqual(page.redirects, ['/verify?userId=25']);
  assert.equal(page.store.size, 0);
});
