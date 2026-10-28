import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';
import javaPlugin from 'prettier-plugin-java';

// Restricted formatting to maintained source trees; generated bundles, secrets,
// database migrations, and installed dependencies were excluded from traversal.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const checkOnly = process.argv.includes('--check');
const extensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.css', '.html', '.java']);
const files = [];

async function collect(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(file);
    else if (extensions.has(path.extname(file))) files.push(file);
  }
}

for (const directory of [
  'frontend/dashboard/src',
  'frontend/landing/src',
  'frontend/landing/pages',
  'frontend/scripts',
  'java-backend/src',
]) {
  await collect(path.join(root, directory));
}
for (const entry of await fs.readdir(path.join(root, 'frontend'), { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith('.js')) {
    files.push(path.join(root, 'frontend', entry.name));
  }
}

let checked = 0;
let changed = 0;
for (const file of files.sort()) {
  const info = await prettier.getFileInfo(file, { ignorePath: path.join(root, '.prettierignore') });
  if (info.ignored) continue;
  const source = await fs.readFile(file, 'utf8');
  const options = await prettier.resolveConfig(file);
  const formatted = await prettier.format(source, {
    ...options,
    filepath: file,
    plugins: [javaPlugin],
  });
  checked++;
  if (source === formatted) continue;
  changed++;
  if (checkOnly) console.error(`Formatting needed: ${path.relative(root, file)}`);
  else await fs.writeFile(file, formatted);
}

if (checkOnly && changed) process.exitCode = 1;
console.log(
  `${checked} source files checked; ${changed} ${checkOnly ? 'need formatting' : 'formatted'}.`,
);
