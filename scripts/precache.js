import { readdir, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

const DROP = [/^test\//, /^scripts\//, /^docs\//, /^plans\//, /^private\//, /^\.git(\/|$)/, /^\.superpowers\//, /^\.claude\//, /^\.gitignore$/, /^package(-lock)?\.json$/, /^README\.md$/, /^sw\.js$/, /^\.DS_Store$/, /\/\.DS_Store$/, /^maps\/README\.md$/];
export function listPublished(paths) { return paths.filter(p => !DROP.some(r => r.test(p))); }

async function walk(dir = '.', base = '') {
  const out = [];
  for (const d of await readdir(dir, { withFileTypes: true })) { const rel = base + d.name; if (d.isDirectory()) out.push(...await walk(dir + '/' + d.name, rel + '/')); else out.push(rel); }
  return out;
}

if (process.argv[1] && process.argv[1].endsWith('precache.js')) {
  const files = listPublished(await walk()).filter(f => f !== 'js/precache-manifest.js').sort();
  files.push('js/precache-manifest.js');
  let version; try { version = execSync('git rev-parse --short HEAD').toString().trim() + '-' + Date.now().toString(36); } catch { version = String(Date.now()); }
  await writeFile('js/precache-manifest.js', `export const VERSION = '${version}';\nexport const PRECACHE = ${JSON.stringify(files.sort(), null, 0)};\n`);
  console.log(`precache: ${files.length} files, version ${version}`);
}
