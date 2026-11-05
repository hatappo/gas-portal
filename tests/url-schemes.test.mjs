import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { browser, catalog, plain, server } from './helpers.mjs';

const shared = () => {
  const context = vm.createContext({});
  vm.runInContext(readFileSync('src/shared/url-schemes.js', 'utf8'), context);
  return context.PortalUrlSchemes;
};

test('Block script schemes always and the default list until unblocked', () => {
  const schemes = shared();
  for (const url of ['javascript:alert(1)', ' JavaScript:alert(1)', 'vbscript:msgbox', 'not a url', '/relative']) {
    assert.equal(schemes.isBlocked(url, ['data', 'javascript', 'vbscript']), true, url);
  }
  for (const url of ['data:text/plain,x', 'file:///etc/hosts', 'blob:https://example.com/id', 'about:blank', 'filesystem:https://example.com/x',
    'ms-msdt:/id PCWDiagnostic', 'MS-MSDT:x', 'search-ms:query=x', 'ms-officecmd:{"id":1}']) {
    assert.equal(schemes.isBlocked(url, []), true, url);
    assert.equal(schemes.isBlocked(url, schemes.optional), false, url);
  }
  for (const url of ['https://example.com', 'http://localhost:4174', 'vscode://file/Users/me/project', 'mailto:a@example.com']) {
    assert.equal(schemes.isBlocked(url, []), false, url);
  }
});

test('Normalize unblocked schemes to known optional ones in canonical order', () => {
  const schemes = shared();
  assert.deepEqual(plain(schemes.normalizeUnblocked(' FILE ,data,javascript,bogus,data')), ['data', 'file']);
  assert.deepEqual(plain(schemes.normalizeUnblocked(['about', 1, 'vbscript'])), ['about']);
  for (const value of [undefined, null, '', 42, {}]) assert.deepEqual(plain(schemes.normalizeUnblocked(value)), []);
});

test('Save only optional schemes to User Properties and ignore invalid stored values', () => {
  const userProperties = {};
  const { context, logs } = server({ userProperties });
  assert.deepEqual(plain(context.saveUnblockedUrlSchemes(['file', 'data'])), { ok: true, schemes: ['data', 'file'] });
  assert.equal(userProperties.UNBLOCKED_URL_SCHEMES, 'data,file');
  assert.deepEqual(plain(context.saveUnblockedUrlSchemes([])), { ok: true, schemes: [] });
  assert.equal(userProperties.UNBLOCKED_URL_SCHEMES, '');
  for (const input of [['javascript'], ['vbscript'], ['vscode'], ['DATA'], ['data', 'data'], [1], 'data', null]) {
    assert.deepEqual(plain(context.saveUnblockedUrlSchemes(input)), { ok: false }, JSON.stringify(input));
  }
  assert.equal(userProperties.UNBLOCKED_URL_SCHEMES, '');
  assert.equal(context.getPortalContent_({ UNBLOCKED_URL_SCHEMES: 'javascript,file,bogus' }).unblockedUrlSchemes, 'file');
  assert.equal(context.getPortalContent_({}).unblockedUrlSchemes, '');
  const failing = server({ PropertiesService: { getUserProperties: () => ({ setProperty() { throw new Error('quota'); } }) } });
  assert.deepEqual(plain(failing.context.saveUnblockedUrlSchemes(['data'])), { ok: false });
  assert.deepEqual(plain(failing.logs), [['URL_SCHEME_SETTINGS_SAVE_FAILED']]);
  assert.deepEqual(logs, []);
});

const mixed = {
  ...catalog,
  tools: [
    { ...catalog.tools[0], id: 'a-editor', name: 'Editor', url: 'vscode://file/Users/me/project', children: [
      { id: 'c1', name: 'Local', url: 'http://localhost:4174/', description: '' },
      { id: 'c2', name: 'Inline', url: 'data:text/plain,hello', description: '' },
    ] },
    { ...catalog.tools[0], id: 'b-data', name: 'Data page', url: 'data:text/html,%3Cmarquee%3Ex%3C/marquee%3E' },
    { ...catalog.tools[0], id: 'c-script', name: 'Script', url: 'javascript:alert(1)' },
  ],
};

test('Show blocked links as plain text without href in both views', (t) => {
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  requests[0].success(mixed);
  for (const container of ['#tools', '#tool-rows']) {
    if (container === '#tool-rows') document.querySelector('#view-list').click();
    const hrefs = [...document.querySelectorAll(`${container} a`)].map((link) => link.getAttribute('href'));
    assert.deepEqual(hrefs, ['vscode://file/Users/me/project', 'http://localhost:4174/'], container);
    const blocked = [...document.querySelectorAll(`${container} span.is-blocked`)];
    assert.equal(blocked.length, 3, container);
    blocked.forEach((element) => {
      assert.equal(element.tagName, 'SPAN');
      assert.equal(element.getAttribute('aria-disabled'), 'true');
      assert.equal(element.hasAttribute('href'), false);
    });
    const texts = [...document.querySelectorAll(`${container} .blocked-url-text`)].map((text) => text.textContent);
    assert.deepEqual(texts, ['data:text/plain,hello', 'data:text/html,%3Cmarquee%3Ex%3C/marquee%3E', 'javascript:alert(1)'], container);
    assert.match(document.querySelector(`${container} .blocked-url-label`).textContent, /ブロック中/);
    assert.equal(document.querySelectorAll('marquee, [onerror]').length, 0);
  }
  document.querySelector('#view-cards').click();
  assert.equal(document.querySelectorAll('.tool-card.is-blocked').length, 2);
});

test('Save checkbox changes, re-render links, and restore choices after failure', (t) => {
  const { dom, document, requests, urlSchemeRequests } = browser();
  t.after(() => dom.window.close());
  requests[0].success(mixed);
  const fieldset = document.querySelector('#url-scheme-settings');
  assert.ok(fieldset.closest('#settings-tools-panel'));
  const boxes = Object.fromEntries([...fieldset.querySelectorAll('input')].map((box) => [box.value, box]));
  assert.deepEqual(Object.keys(boxes), ['data', 'file', 'blob', 'about', 'filesystem', 'ms-msdt', 'search-ms', 'ms-officecmd']);
  assert.ok(Object.values(boxes).every((box) => box.checked), 'All optional schemes start blocked');
  const toggle = (scheme) => { boxes[scheme].checked = !boxes[scheme].checked; boxes[scheme].dispatchEvent(new dom.window.Event('change', { bubbles: true })); };

  toggle('data');
  assert.equal(fieldset.disabled, true);
  assert.deepEqual(plain(urlSchemeRequests[0].schemes), ['data']);
  urlSchemeRequests[0].success({ ok: true, schemes: ['data'] });
  assert.equal(fieldset.disabled, false);
  assert.equal(fieldset.dataset.savedValue, 'data');
  assert.equal(document.querySelector('#url-scheme-settings-status').textContent, '保存しました');
  const hrefs = [...document.querySelectorAll('#tools a')].map((link) => link.getAttribute('href'));
  assert.ok(hrefs.includes('data:text/html,%3Cmarquee%3Ex%3C/marquee%3E'));
  assert.ok(!hrefs.includes('javascript:alert(1)'), 'Script schemes stay blocked');
  assert.equal(requests.length, 1, 'Re-rendering must not refetch the catalog');

  toggle('file');
  urlSchemeRequests[1].failure();
  assert.equal(boxes.file.checked, true);
  assert.equal(fieldset.dataset.savedValue, 'data');
  assert.match(document.querySelector('#url-scheme-settings-status').textContent, /保存できませんでした/);

  toggle('about');
  urlSchemeRequests[2].success({ ok: false });
  assert.equal(boxes.about.checked, true);
});
