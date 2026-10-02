import { test } from 'node:test';
import assert from 'node:assert/strict';

// Minimal DOM stand-in so dom.js can be tested without a browser.
class El {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.listeners = {}; this.textContent = ''; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener(k, fn) { this.listeners[k] = fn; }
  appendChild(c) { this.children.push(c); return c; }
  get firstChild() { return this.children[0] || null; }
  removeChild(c) { this.children = this.children.filter(x => x !== c); }
}
globalThis.document = {
  createElement: t => new El(t),
  createTextNode: s => ({ nodeType: 3, textContent: String(s) }),
};
const { h, clear } = await import('../js/ui/dom.js');

test('h builds an element with attrs, listeners, and nested children', () => {
  let clicked = false;
  const el = h('div', { class: 'row', 'data-id': 7, onclick: () => { clicked = true; } },
    'text', null, [h('span', {}, 'a'), h('span', {}, 'b')]);
  assert.equal(el.tagName, 'DIV');
  assert.equal(el.attrs.class, 'row');
  assert.equal(el.attrs['data-id'], '7');
  assert.equal(el.children.length, 3);
  assert.equal(el.children[0].textContent, 'text');
  assert.equal(el.children[1].tagName, 'SPAN');
  el.listeners.click();
  assert.equal(clicked, true);
});

test('clear removes every child', () => {
  const el = h('ul', {}, h('li'), h('li'));
  clear(el);
  assert.equal(el.children.length, 0);
});
