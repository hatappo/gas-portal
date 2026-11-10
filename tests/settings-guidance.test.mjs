import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browser, bundleBrowser } from './helpers.mjs';
const client = await bundleBrowser({ connectGitHub: false, connectCalendar: true });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function fixture(t, gas = false) {
  const pushes = [];
  const app = browser(window => {
    if (gas) {
      window.google.script.url = { getLocation(done) { done({ hash: 'inbox-and-tasks' }); } };
      window.google.script.history = { push(...args) { pushes.push(args); }, setChangeHandler() {} };
    }
  }, client);
  t.after(() => app.dom.window.close());
  app.dom.window.testPortal.actions.setSources('empty', []);
  return { ...app, pushes, get: id => app.document.getElementById(id) };
}

for (const gas of [false, true]) test(`Setup guidance opens the matching settings tab with ${gas ? 'GAS history' : 'local history'}`, async t => {
  const app = fixture(t, gas);
  app.get('setting-name').value = 'Unsaved portal';
  app.requests[0].success({ ok: false, error: 'Set a spreadsheet ID or Google Sheets URL in Settings.' });
  app.get('tab-actions').click();
  for (const [host, section] of [['inbox-services', 'sources'], ['action-items', 'sources'], ['status-description', 'sources']]) {
    const route = section;
    const link = app.get(host).querySelector('a.settings-guidance-link');
    assert.ok(link, host);
    assert.equal(link.textContent, '設定');
    assert.equal(link.getAttribute('href'), '#settings/' + route);
    link.click();
    assert.equal(app.get('settings-' + section + '-panel').hidden, false);
    assert.equal(app.document.activeElement.id, 'settings-tab-' + section);
    if (gas) assert.equal(app.pushes.at(-1)[2], 'settings/' + route);
    else assert.equal(app.dom.window.location.hash, '#settings/' + route);
  }
  app.get('toggle-calendar').click();
  app.calendarRequests[0].success({ ok: true, settings: { calendarIds: ['primary'], cacheSeconds: 300, alertMinutes: 0 } }); await flush();
  app.calendarRequests.at(-1).success({ ok: false, error: 'INVALID_INPUT' }); await flush();
  const calendarLink = app.get('calendar-panel').querySelector('a.settings-guidance-link');
  assert.equal(calendarLink.getAttribute('href'), '#settings/calendar');
  calendarLink.click();
  assert.equal(app.get('settings-calendar-panel').hidden, false);
  assert.equal(app.document.activeElement.id, 'settings-tab-calendar');
  assert.equal(app.get('setting-name').value, 'Unsaved portal');
});

test('Guidance links survive language changes and never turn arbitrary error text into HTML', t => {
  const app = fixture(t);
  app.requests[0].success({ ok: false, error: 'Set a spreadsheet ID or Google Sheets URL in Settings.' });
  const select = app.get('portal-language');
  select.value = 'en'; select.dispatchEvent(new app.dom.window.Event('change', { bubbles: true }));
  app.languageRequests.at(-1).success({ ok: true, language: 'en' });
  for (const host of ['status-description', 'inbox-services', 'action-items']) {
    const link = app.get(host).querySelector('a.settings-guidance-link');
    assert.ok(link, host);
    assert.equal(link.textContent, 'Settings');
  }
  assert.match(app.get('status-description').textContent, /Set a spreadsheet ID/);
  app.get('refresh-catalog').click();
  app.requests.at(-1).success({ ok: false, error: '<img src=x onerror=alert(1)> Settings' });
  assert.equal(app.get('status-description').querySelector('img'), null);
  assert.equal(app.get('status-description').querySelector('a'), null);
  assert.equal(app.get('status-description').textContent, '<img src=x onerror=alert(1)> Settings');
});
