import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve('dist');
export const pagesBase = process.env.PAGES_BASE_PATH ?? '/flowchart-maker/';
assert(pagesBase.startsWith('/') && pagesBase.endsWith('/') && !pagesBase.includes('..'), 'PAGES_BASE_PATH must be an absolute URL path with a trailing slash.');
async function list(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    assert(!entry.isSymbolicLink(), `Deployment must not include symlinks: ${entry.name}`);
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) result.push(...await list(path));
    else result.push(relative(root, path).split(sep).join('/'));
  }
  return result;
}
const files = await list(root);
assert(files.includes('index.html'), 'Missing dist/index.html');
// This app currently needs only these generated assets. Keep reports, source and references out.
for (const file of files) assert(file === 'index.html' || /^assets\/[A-Za-z0-9_-]+\.(?:js|css|wasm)$/.test(file), `Unexpected deployment file: ${file}`);
assert(files.some(f => /^assets\/tree-sitter-c-.*\.wasm$/.test(f)), 'C grammar WASM is missing');
assert(files.some(f => /^assets\/tree-sitter-(?!c-).*\.wasm$/.test(f)), 'Parser runtime WASM is missing');
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const links = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]);
assert(links.length > 0, 'No built assets found');
for (const link of links) {
  assert(link.startsWith(pagesBase), `Asset is outside the Pages base path: ${link}`);
  assert(files.includes(link.slice(pagesBase.length)), `Referenced asset is missing: ${link}`);
}
console.log(`Deployment check passed: ${files.length} files, base ${pagesBase}; source, reports and references excluded.`);
