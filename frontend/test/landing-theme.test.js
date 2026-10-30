const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('../dashboard/node_modules/typescript');

const landing = path.resolve(__dirname, '../landing');
const compiled = (file) =>
  ts.transpileModule(fs.readFileSync(path.join(landing, 'src/ts', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

// Exercised the actual theme scripts with fresh document contexts sharing one browser store.
// Simulated denied storage independently so appearance never blocked public-page startup.
function openPage({ saved, systemLight = false, blocked = false, store = new Map() } = {}) {
  if (saved !== undefined) store.set('user-theme', saved);
  const documentEvents = {},
    windowEvents = {},
    buttonEvents = {},
    attributes = {};
  const meta = {};
  let systemChange;
  const media = {
    matches: systemLight,
    addEventListener: (_, callback) => {
      systemChange = callback;
    },
  };
  const button = {
    setAttribute: (name, value) => {
      attributes[name] = value;
    },
    addEventListener: (name, callback) => {
      buttonEvents[name] = callback;
    },
  };
  const document = {
    documentElement: { dataset: {} },
    getElementById: (id) => (id === 'theme_button' ? button : null),
    querySelector: () => ({
      setAttribute: (name, value) => {
        meta[name] = value;
      },
    }),
    querySelectorAll: () => [],
    addEventListener: (name, callback) => {
      documentEvents[name] = callback;
    },
  };
  const context = vm.createContext({
    document,
    window: {
      addEventListener: (name, callback) => {
        windowEvents[name] = callback;
      },
    },
    localStorage: {
      getItem: (key) => {
        if (blocked) throw new Error('Storage denied');
        return store.get(key) ?? null;
      },
      setItem: (key, value) => {
        if (blocked) throw new Error('Storage denied');
        store.set(key, value);
      },
    },
    matchMedia: (query) =>
      query.includes('prefers-color-scheme')
        ? media
        : {
            matches: false,
            addEventListener: () => {},
          },
    require: () => ({ endSession: async () => {}, finishLogout: async () => {} }),
    exports: {},
    Intl,
  });
  vm.runInContext(compiled('theme-init.ts'), context);
  const beforeMain = document.documentElement.dataset.theme;
  vm.runInContext(compiled('main.ts'), context);
  return {
    document,
    beforeMain,
    attributes,
    meta,
    store,
    windowEvents,
    buttonEvents,
    media,
    systemChange: (matches) => {
      media.matches = matches;
      systemChange({ matches });
    },
  };
}

test('saved light and dark preferences win over device settings before and after startup', () => {
  for (const saved of ['light', 'dark']) {
    const page = openPage({ saved, systemLight: saved === 'dark' });
    assert.equal(page.beforeMain, saved);
    assert.equal(page.document.documentElement.dataset.theme, saved);
    assert.equal(
      page.attributes['aria-label'],
      `Switch to ${saved === 'light' ? 'dark' : 'light'} theme`,
    );
  }
});

test('a theme selection survives reloads and newly opened tabs sharing the same store', () => {
  const first = openPage({ systemLight: false });
  first.buttonEvents.click();
  assert.equal(first.store.get('user-theme'), 'light');
  assert.equal(first.attributes['aria-pressed'], 'true');
  assert.equal(first.meta.content, '#f3f4f7');
  const reopened = openPage({ store: first.store });
  assert.equal(reopened.beforeMain, 'light');
  reopened.buttonEvents.click();
  assert.equal(openPage({ store: first.store }).beforeMain, 'dark');
});

test('blocked storage still permits switching themes without breaking startup', () => {
  const page = openPage({ blocked: true, systemLight: true });
  assert.equal(page.beforeMain, 'light');
  assert.doesNotThrow(() => page.buttonEvents.click());
  assert.equal(page.document.documentElement.dataset.theme, 'dark');
});

test('system changes apply only until a user preference has been selected', () => {
  const page = openPage();
  page.systemChange(true);
  assert.equal(page.document.documentElement.dataset.theme, 'light');
  page.buttonEvents.click();
  page.systemChange(true);
  assert.equal(page.document.documentElement.dataset.theme, 'dark');
});

test('other-tab preference changes update appearance and accessible control labels', () => {
  const page = openPage();
  page.windowEvents.storage({ key: 'user-theme', newValue: 'light' });
  assert.equal(page.document.documentElement.dataset.theme, 'light');
  assert.equal(page.attributes['aria-label'], 'Switch to dark theme');
  page.windowEvents.storage({ key: 'unrelated', newValue: 'dark' });
  assert.equal(page.document.documentElement.dataset.theme, 'light');
});

test('every public page loads the prepaint script before styles, including nested 404 responses', () => {
  for (const name of fs
    .readdirSync(path.join(landing, 'pages'))
    .filter((name) => name.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(landing, 'pages', name), 'utf8');
    const script = '<script src="/assets/theme-init.js"></script>';
    assert.ok(html.includes(script), name);
    assert.ok(html.indexOf(script) < html.indexOf('<link rel="stylesheet"'), name);
    assert.match(html, /href="\/static\/finapp-circle.svg"/, name);
  }
});
