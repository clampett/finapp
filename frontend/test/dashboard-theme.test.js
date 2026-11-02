const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../dashboard/node_modules/typescript');
const sourceDir = path.resolve(__dirname, '../dashboard/src');
const compiled = ts.transpileModule(fs.readFileSync(path.join(sourceDir, 'useTheme.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

// Exercised the production hook in fresh document contexts, sharing only browser
// preferences. Left React rendering out so no backend or financial data was needed.
function workspace({ store = new Map(), denied = false, systemLight = false } = {}) {
  const dataset = {},
    listeners = {},
    mediaListeners = {},
    meta = {};
  const effects = [],
    dependencies = [],
    cleanups = [];
  let state,
    initialized = false,
    effectIndex = 0;
  const media = {
    matches: systemLight,
    addEventListener: (name, fn) => {
      mediaListeners[name] = fn;
    },
    removeEventListener: (name) => {
      delete mediaListeners[name];
    },
  };
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: () => ({
      useState: (initial) => {
        if (!initialized) {
          state = initial();
          initialized = true;
        }
        return [
          state,
          (next) => {
            state = next;
          },
        ];
      },
      useEffect: (callback, deps) => {
        const index = effectIndex++;
        if (!dependencies[index] || deps.some((value, i) => value !== dependencies[index][i])) {
          dependencies[index] = deps;
          effects.push(() => {
            cleanups[index]?.();
            cleanups[index] = callback();
          });
        }
      },
    }),
    localStorage: {
      getItem: (key) => {
        if (denied) throw new Error('Denied');
        return store.get(key) ?? null;
      },
      setItem: (key, value) => {
        if (denied) throw new Error('Denied');
        store.set(key, value);
      },
    },
    matchMedia: () => media,
    document: {
      documentElement: { dataset },
      querySelector: () => ({
        setAttribute: (name, value) => {
          meta[name] = value;
        },
      }),
    },
    window: {
      addEventListener: (name, fn) => {
        listeners[name] = fn;
      },
      removeEventListener: (name) => {
        delete listeners[name];
      },
    },
  });
  function render() {
    effectIndex = 0;
    const hook = exports.useTheme();
    effects.splice(0).forEach((effect) => effect());
    return hook;
  }
  return {
    render,
    dataset,
    store,
    listeners,
    mediaListeners,
    media,
    meta,
    unmount: () => cleanups.forEach((cleanup) => cleanup?.()),
  };
}

test('dashboard restores the public-page theme and saves toggles for reopened workspaces', () => {
  const store = new Map([['user-theme', 'light']]);
  const first = workspace({ store });
  assert.equal(first.render().theme, 'light');
  assert.equal(first.dataset.theme, 'light');
  first.render().toggleTheme();
  assert.equal(first.render().theme, 'dark');
  assert.equal(store.get('user-theme'), 'dark');
  const reopened = workspace({ store, systemLight: true });
  assert.equal(reopened.render().theme, 'dark');
  assert.equal(reopened.meta.content, '#0c1018');
});

test('dashboard follows another tab and handles a cleared preference', () => {
  const page = workspace();
  page.render();
  page.store.set('user-theme', 'light');
  page.listeners.storage({ key: 'user-theme' });
  assert.equal(page.render().theme, 'light');
  page.store.clear();
  page.listeners.storage({ key: null });
  assert.equal(page.render().theme, 'dark');
});

test('dashboard uses the device default until an explicit theme has been saved', () => {
  const page = workspace({ systemLight: true });
  page.render();
  assert.equal(page.dataset.theme, 'light');
  page.media.matches = false;
  page.mediaListeners.change();
  page.render();
  assert.equal(page.dataset.theme, 'dark');
  page.render().toggleTheme();
  page.render();
  page.mediaListeners.change();
  page.render();
  assert.equal(page.dataset.theme, 'light');
  page.unmount();
  assert.equal(Object.keys(page.listeners).length, 0);
  assert.equal(Object.keys(page.mediaListeners).length, 0);
});

test('dashboard theme remains usable when persistent storage is blocked', () => {
  const page = workspace({ denied: true });
  assert.doesNotThrow(() => page.render().toggleTheme());
  assert.equal(page.render().theme, 'light');
});

test('all migrated visual paints resolve and retain their original dark colors', () => {
  const palette = fs.readFileSync(path.join(sourceDir, 'theme-palette.css'), 'utf8');
  const dark = palette.split(":root[data-theme='light']")[0];
  const definitions = new Map(
    [...dark.matchAll(/(--ui-[\w-]+):\s*(#[\da-f]+);/g)].map((m) => [m[1], m[2]]),
  );
  function inspect(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, item.name);
      if (item.isDirectory()) inspect(file);
      else if (/\.tsx?$/.test(file)) {
        for (const match of fs.readFileSync(file, 'utf8').matchAll(/var\((--ui-[\w-]+)\)/g)) {
          assert.ok(definitions.has(match[1]), `${item.name}: ${match[1]}`);
          assert.equal(definitions.get(match[1]), `#${match[1].split('-').at(-1)}`);
        }
      }
    }
  }
  inspect(sourceDir);
});
