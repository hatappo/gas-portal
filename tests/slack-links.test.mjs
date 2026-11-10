import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browser, bundleBrowser, catalog } from './helpers.mjs';
const client = await bundleBrowser({ connectSlack: true });
const connection = { id: '33333333-3333-4333-8333-333333333333', label: 'Demo@alex' };
const title = '📖'.repeat(48) + ' searchable tail <img src=x>';
const response = (overrides = {}) => ({ ok: true, workspace: 'Demo', url: 'https://demo.slack.com/', items: [{ title, url: 'https://demo.slack.com/archives/CDEMO/p1793987462000001' }], hasMore: false, partial: false, error: '', fetchedAt: Date.now(), cached: false, ...overrides });
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture(t) {
  const app = browser(() => {}, client); t.after(() => app.dom.window.close());
  app.slackRequests[0].success({ ok: true, connections: [connection] });
  return app;
}

test('Saved messages prepend a workspace card, truncate Unicode safely and search full tooltip text', async t => {
  const app = fixture(t), doc = app.document;
  app.requests[0].success(catalog); app.slackBookmarkRequests[0].success(response()); await settle();
  assert.equal(doc.querySelector('.tool-card h3').textContent.includes('Demo'), true);
  assert.equal(doc.querySelector('.tool-main').href, 'https://demo.slack.com/');
  assert.equal(doc.querySelector('.related-label').textContent, '📖'.repeat(48) + '…');
  assert.equal(doc.querySelector('.related-links a').getAttribute('aria-description'), title);
  assert.equal(doc.querySelectorAll('.related-links img[src="x"]').length, 0);
  const input = doc.querySelector('#search'); input.value = 'searchable tail'; input.dispatchEvent(new app.dom.window.Event('input', { bubbles: true }));
  assert.equal(doc.querySelectorAll('.tool-card').length, 1);
  doc.querySelector('#view-list').click(); assert.equal(doc.querySelectorAll('#tool-rows tr').length, 1);
  assert.match(doc.querySelector('#tool-rows').textContent, /Demo/);
});

test('Links refresh waits for spreadsheet and saved messages and does not fetch To-do details', async t => {
  const app = fixture(t), doc = app.document;
  app.requests[0].success(catalog); app.slackBookmarkRequests[0].success(response()); await settle();
  doc.querySelector('#refresh-catalog').click();
  assert.equal(app.requests[1].forceRefresh, true); assert.equal(app.slackBookmarkRequests[1].force, true);
  app.requests[1].success(catalog); assert.equal(doc.querySelector('#refresh-catalog').disabled, true);
  app.slackBookmarkRequests[1].success(response()); await settle();
  assert.equal(doc.querySelector('#refresh-catalog').disabled, false);
  assert.equal(app.slackRequests.filter(request => request.kind === 'actions').length, 0);
});

test('Saved links work without a spreadsheet, while a Slack failure preserves spreadsheet entries', async t => {
  const app = fixture(t), doc = app.document;
  app.requests[0].success({ ok: false, error: 'Set a spreadsheet ID or Google Sheets URL in Settings.' });
  app.slackBookmarkRequests[0].success(response()); await settle();
  assert.equal(doc.querySelectorAll('.tool-card').length, 1);
  assert.equal(doc.querySelector('#search').disabled, false);
  assert.equal(doc.querySelector('#links-notices a').getAttribute('href'), '#settings/sources');
  doc.querySelector('#refresh-catalog').click();
  app.requests[1].success(catalog); app.slackBookmarkRequests[1].failure(); await settle();
  assert.equal(doc.querySelectorAll('.tool-card').length, catalog.tools.length);
  assert.equal(doc.querySelector('#links-notices').hidden, false);
});

test('Invalid saved links cannot inject external workspace URLs', async t => {
  const app = fixture(t); app.requests[0].success(catalog);
  app.slackBookmarkRequests[0].success(response({ url: 'https://evil.example/' })); await settle();
  assert.equal(app.document.querySelectorAll('.is-saved-links').length, 0);
  assert.equal(app.document.querySelectorAll('.tool-card').length, catalog.tools.length);
});

test('Disconnect removes the saved card and a late response cannot restore it', async t => {
  const app = fixture(t), doc = app.document;
  app.requests[0].success(catalog);
  app.slackBookmarkRequests[0].success(response()); await settle();
  [...doc.querySelectorAll('#tags button')].find(button => button.textContent === 'Slack').click();
  assert.equal(doc.querySelectorAll('.tool-card').length, 1);
  doc.querySelector('#refresh-catalog').click(); app.requests[1].success(catalog);
  doc.querySelector('#tab-settings').click(); doc.querySelector('#settings-tab-sources').click();
  app.githubRequests[0].success({ ok: true, connections: [] });
  app.dom.window.confirm = () => true;
  doc.querySelector('#slack-connections button:last-child').click();
  app.slackRequests.find(request => request.kind === 'disconnect').success({ ok: true });
  app.slackBookmarkRequests[1].success(response()); await settle();
  assert.equal(doc.querySelectorAll('.is-saved-links').length, 0);
  assert.equal(doc.querySelectorAll('.tool-card').length, catalog.tools.length);
});
