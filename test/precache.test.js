import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { listPublished } from '../scripts/precache.js';

async function walk(dir, base = '') {
  const out = [];
  for (const d of await readdir(new URL('../' + dir, import.meta.url), { withFileTypes: true })) {
    const rel = base + d.name;
    if (d.isDirectory()) out.push(...await walk(dir + d.name + '/', rel + '/')); else out.push(rel);
  }
  return out;
}

test('listPublished keeps app files and drops test, scripts, docs, private, git', () => {
  const r = listPublished(['index.html', 'js/app.js', 'content/lakes.json', 'maps/cisco.jpg', 'test/x.test.js', 'scripts/precache.js', 'docs/a.md', 'private/spots-seed.json', '.git/HEAD', '.git', '.superpowers/sdd/x/progress.md', '.claude/launch.json', '.gitignore', 'package.json', 'README.md', 'sw.js', 'js/precache-manifest.js', '.DS_Store', 'icons/icon.svg']);
  assert.deepEqual(r.sort(), ['content/lakes.json', 'icons/icon.svg', 'index.html', 'js/app.js', 'js/precache-manifest.js', 'maps/cisco.jpg'].sort());
});

test('the committed manifest matches the tree', async () => {
  const files = await walk('');
  const expected = listPublished(files).sort();
  const src = await readFile(new URL('../js/precache-manifest.js', import.meta.url), 'utf8');
  const got = JSON.parse(src.match(/PRECACHE = (\[[\s\S]*?\]);/)[1]).sort();
  assert.deepEqual(got, expected, 'run: npm run precache');
  assert.ok(/VERSION = '[^']+'/.test(src));
});
