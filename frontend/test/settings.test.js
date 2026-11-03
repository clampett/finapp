const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../dashboard/node_modules/typescript');

const dashboardSrc = path.resolve(__dirname, '../dashboard/src');

function readTsx(relativePath) {
  return fs.readFileSync(path.join(dashboardSrc, relativePath), 'utf8');
}

test('User Story 20 & Navigation: App.tsx defines unified settings view and maintains existing views', () => {
  const tsx = readTsx('App.tsx');

  // Verify all views are declared in views array
  assert.match(tsx, /id:\s*'settings'/);
  assert.match(tsx, /label:\s*'Settings'/);
  assert.match(tsx, /icon:\s*'⚙'/);

  // Verify backward compatibility with original 5 views
  assert.match(tsx, /id:\s*'overview'/);
  assert.match(tsx, /id:\s*'graph'/);
  assert.match(tsx, /id:\s*'cashflow'/);
  assert.match(tsx, /id:\s*'budgeting'/);
  assert.match(tsx, /id:\s*'investing'/);
});

test('Header Profile Button: App.tsx renders accessible user icon that navigates to settings', () => {
  const tsx = readTsx('App.tsx');

  // User icon button exists in header with accessible label
  assert.match(tsx, /aria-label="User profile and settings"/);
  assert.match(tsx, /title="User profile and settings"/);

  // Clicking it switches view to settings
  assert.match(tsx, /setView\('settings'\)/);

  // Renders profile picture or initials fallback
  assert.match(tsx, /userProfile\.profilePicture/);
  assert.match(tsx, /getInitials/);
});

test('User Story 18: SettingsTab.tsx contains profile picture upload, direct FileReader data URL reading, and remove actions', () => {
  const tsx = readTsx('components/SettingsTab.tsx');

  // Profile picture card elements
  assert.match(tsx, /Profile Picture/);
  assert.match(tsx, /accept="image\/png, image\/jpeg, image\/webp, image\/gif/);
  assert.match(tsx, /Upload Photo/);
  assert.match(tsx, /Remove Photo/);

  // Direct FileReader data URL reading without canvas GPU artifacts
  assert.match(tsx, /readFileAsDataUrl/);
  assert.match(tsx, /new FileReader\(\)/);
  assert.match(tsx, /readAsDataURL\(file\)/);
});

test('Dashboard Header: color switch button is removed from dashboard header', () => {
  const tsx = readTsx('App.tsx');
  assert.doesNotMatch(tsx, /className="workspace-theme-switch"/);
});

test('User Story 20: SettingsTab.tsx has separate display name and immutable username fields', () => {
  const tsx = readTsx('components/SettingsTab.tsx');

  // Display Name input exists with validation limits
  assert.match(tsx, /id="user-display-name"/);
  assert.match(tsx, /maxLength=\{50\}/);
  assert.match(tsx, /Display name cannot be empty/);
  assert.match(tsx, /Display name cannot exceed 50 characters/);

  // Account username is separate and locked
  assert.match(tsx, /id="user-login-username"/);
  assert.match(tsx, /disabled/);
  assert.match(tsx, /Your unique sign-in username cannot be altered/);
});

test('User Story 19: SettingsTab.tsx provides 3-way theme selection (Dark, Light, System Default)', () => {
  const tsx = readTsx('components/SettingsTab.tsx');

  // Themes
  assert.match(tsx, /handleThemeChange\('dark'\)/);
  assert.match(tsx, /handleThemeChange\('light'\)/);
  assert.match(tsx, /handleThemeChange\('system'\)/);
  assert.match(tsx, /onSelectTheme\(choice\)/);
  assert.match(tsx, /prefers-color-scheme/);
});

test('Theme Hook: useTheme supports selectTheme for dark, light, and system modes', () => {
  const tsSource = readTsx('useTheme.ts');
  assert.match(tsSource, /selectTheme/);
  assert.match(tsSource, /choice === 'system'/);
  assert.match(tsSource, /localStorage\.removeItem\(preferenceKey\)/);
  assert.match(tsSource, /localStorage\.setItem\(preferenceKey, choice\)/);
});

test('Initials Helper: extracts 1 or 2 uppercase initials correctly', () => {
  const compiled = ts.transpileModule(readTsx('components/SettingsTab.tsx'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.React,
    },
  }).outputText;

  const exports = {};
  const vm = require('node:vm');
  vm.runInNewContext(compiled, {
    exports,
    require: () => ({ useState: () => [], useRef: () => ({ current: null }), useEffect: () => {} }),
    React: { createElement: () => null },
  });

  assert.equal(exports.getInitials('John Doe'), 'JD');
  assert.equal(exports.getInitials('Alex Rivera (Recent Grad)'), 'AG');
  assert.equal(exports.getInitials('Taylor'), 'TA');
  assert.equal(exports.getInitials(''), 'U');
  assert.equal(exports.getInitials('   '), 'U');
});
