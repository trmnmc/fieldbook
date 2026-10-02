import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../css/app.css', import.meta.url), 'utf8');

// With viewport-fit=cover the page draws under the iPhone status bar, and iOS keeps taps there.
// Only the header pads for the safe area, so the update banner must come after it.
test('update banner sits below the safe-area header so Reload can be tapped', () => {
  assert.match(css, /\.top\s*\{[^}]*env\(safe-area-inset-top\)/);
  const header = html.indexOf('<header class="top"');
  const banner = html.indexOf('id="banner"');
  assert.ok(header >= 0 && banner >= 0);
  assert.ok(banner > header, 'banner must follow the header');
});
