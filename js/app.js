import { h, clear } from './ui/dom.js';

const views = {
  plan: () => h('div', { class: 'card' }, h('h2', {}, 'Plan'), h('p', {}, 'Planner arrives in Task 11.')),
  trip: () => h('div', { class: 'card' }, h('h2', {}, 'Trip')),
  learn: () => h('div', { class: 'card' }, h('h2', {}, 'Learn')),
  lakes: () => h('div', { class: 'card' }, h('h2', {}, 'Lakes')),
  settings: () => h('div', { class: 'card' }, h('h2', {}, 'Settings')),
};

export function navigate(hash) {
  const name = (hash || '#plan').replace('#', '').split('/')[0] || 'plan';
  const view = document.getElementById('view');
  clear(view);
  view.appendChild((views[name] || views.plan)());
  document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + name));
}

window.addEventListener('hashchange', () => navigate(location.hash));
navigate(location.hash);
window.app = { navigate, views };
