import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browser, catalog } from './helpers.mjs';

function fixture(t) {
  const app = browser();
  t.after(() => app.dom.window.close());
  app.requests[0].success(catalog);
  return app;
}

test('Cards and List form an exclusive radio group, retain their choice and disable during refresh', (t) => {
  const { document: doc, requests } = fixture(t);
  const cards = doc.getElementById('view-cards');
  const list = doc.getElementById('view-list');
  assert.equal(cards.closest('[role="radiogroup"]').getAttribute('aria-label'), '表示形式');
  assert.equal(cards.checked, true);
  list.closest('label').click();
  assert.equal(list.checked, true);
  assert.equal(cards.checked, false);
  list.closest('label').click();
  assert.equal(list.checked, true, 'A repeated selection must not clear the view');
  doc.getElementById('refresh-catalog').click();
  assert.ok(cards.disabled && list.disabled);
  cards.click();
  requests[1].success(catalog);
  assert.equal(list.checked, true);
  assert.equal(doc.querySelector('#table-view').hidden, false);
});

test('Refresh tooltips open on keyboard focus, follow language changes, close with Escape and keep the timestamp description', (t) => {
  const { dom, document: doc } = fixture(t);
  const button = doc.getElementById('refresh-catalog');
  button.focus();
  const tooltip = doc.querySelector('[role="tooltip"]');
  assert.ok(tooltip);
  assert.equal(tooltip.textContent, '最新データを取得');
  assert.equal(button.title, '');
  assert.deepEqual(button.getAttribute('aria-describedby').split(' '), ['catalog-freshness', tooltip.id]);
  doc.documentElement.lang = 'en';
  doc.dispatchEvent(new dom.window.Event('portal:languagechange'));
  assert.equal(tooltip.textContent, 'Fetch latest');
  button.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(doc.querySelector('[role="tooltip"]'), null);
  assert.equal(button.getAttribute('aria-describedby'), 'catalog-freshness');
});

test('Theme group has an accessible name and keeps native radio inputs inside clickable preview cards', (t) => {
  const { document: doc, themeRequests } = fixture(t);
  const choice = doc.querySelector('input[name="portal-theme"][value="nord"]');
  assert.equal(choice.closest('[role="radiogroup"]').getAttribute('aria-labelledby'), 'theme-settings-title');
  choice.closest('label').click();
  assert.equal(themeRequests.length, 1);
  assert.equal(themeRequests[0].theme, 'nord');
  themeRequests[0].failure();
  assert.equal(doc.querySelector('input[name="portal-theme"]:checked').value, 'auto');
});

test('View group labels follow the language even when the catalog failed to load', (t) => {
  const app = browser();
  t.after(() => app.dom.window.close());
  app.requests[0].failure();
  app.document.documentElement.lang = 'en';
  app.document.dispatchEvent(new app.dom.window.Event('portal:languagechange'));
  assert.equal(app.document.querySelector('.view-switch [role="radiogroup"]').getAttribute('aria-label'), 'View mode');
  assert.equal(app.document.getElementById('view-cards').disabled, true);
});
