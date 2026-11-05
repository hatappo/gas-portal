import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browser, catalog, entry, server, plain, sheetRows } from './helpers.mjs';

test("Search and filter automatic GAS tags in both views", (t) => {
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  const { context } = server({ values: sheetRows([
    entry({ url: 'https://script.google.com/macros/s/test/exec', tags: ['業務'] }),
    entry({ id: 'other', name: '別サービス', tags: [] }),
  ]) });
  requests[0].success(plain(context.getCatalog()));
  assert.equal(document.querySelectorAll('#tools a').length, 2);
  const search = document.querySelector('#search');
  search.value = 'gas';
  search.dispatchEvent(new dom.window.Event('input'));
  assert.equal(document.querySelectorAll('#tools a').length, 1);
  search.value = '';
  search.dispatchEvent(new dom.window.Event('input'));
  [...document.querySelectorAll('#tags button')].find((button) => button.textContent === 'GAS').click();
  assert.equal(document.querySelectorAll('#tools a').length, 1);
  assert.match(document.querySelector('#tools').textContent, /GAS/);
  document.querySelector('#view-list').click();
  assert.equal(document.querySelectorAll('#tool-rows tr').length, 1);
  assert.match(document.querySelector('#tool-rows').textContent, /GAS/);
});

test("Preserve scope, tags, and search when switching views", (t) => {
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  requests[0].success({ ...catalog, tools: [
    { ...catalog.tools[0], scope: 'internal', tags: ['申請', '経理'] },
    { ...catalog.tools[1], scope: 'external', tags: ['申請', '経理'] },
  ] });
  document.querySelector('#scope-external').click();
  [...document.querySelectorAll('#tags button')].find((button) => button.textContent === '経理').click();
  document.querySelector('#search').value = 'guide';
  document.querySelector('#search').dispatchEvent(new dom.window.Event('input'));
  document.querySelector('#view-list').click();
  assert.equal(document.querySelector('#tools').hidden, true);
  assert.equal(document.querySelector('#table-view').hidden, false);
  assert.equal(document.querySelectorAll('#tool-rows tr').length, 1);
  assert.match(document.querySelector('#tool-rows').textContent, /Guide.*社外.*申請.*経理/);
  const link = document.querySelector('#tool-rows a');
  assert.equal(link.href, catalog.tools[1].url);
  assert.equal(link.target, '_blank');
  assert.equal(link.rel, 'noopener noreferrer');
  document.querySelector('#view-cards').click();
  assert.equal(document.querySelectorAll('#tools a').length, 1);
  assert.match(document.querySelector('#tools').textContent, /Guide/);
  assert.equal(document.querySelector('#table-view').hidden, true);
  assert.equal(document.querySelector('#search').value, 'guide');
});

test("Combine tags with AND logic and support deselection and clearing all filters", (t) => {
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  requests[0].success({ ...catalog, tools: [
    { ...catalog.tools[0], scope: 'internal', tags: ['申請', '経理'] },
    { ...catalog.tools[1], scope: 'external', tags: ['申請'] },
  ] });
  const tag = (text) => [...document.querySelectorAll('#tags button')].find((button) => button.textContent === text);
  tag('申請').click();
  assert.equal(document.querySelectorAll('#tools a').length, 2);
  tag('経理').click();
  assert.equal(document.querySelectorAll('#tools a').length, 1);
  tag('経理').click();
  assert.equal(document.querySelectorAll('#tools a').length, 2);
  document.querySelector('#scope-external').click();
  tag('経理').click();
  assert.equal(document.querySelectorAll('#tools a').length, 0);
  document.querySelector('#reset').click();
  assert.equal(document.querySelectorAll('#tools a').length, 2);
  assert.equal(document.querySelector('#scope-all').getAttribute('aria-pressed'), 'true');
});

test("Search tags without showing labels for tools that have no tags", (t) => {
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  requests[0].success({ ...catalog, tools: [
    { ...catalog.tools[0], scope: 'internal', tags: ['人事'] },
    { ...catalog.tools[1], scope: 'external', tags: [] },
  ] });
  assert.doesNotMatch(document.querySelector('#tools').textContent, /タグなし/);
  assert.equal(document.querySelectorAll('#tools .tool-tags')[1].hidden, true);
  document.querySelector('#view-list').click();
  assert.doesNotMatch(document.querySelector('#tool-rows').textContent, /タグなし/);
  assert.equal(document.querySelectorAll('#tool-rows .tool-tags')[1].hidden, true);
  document.querySelector('#view-cards').click();
  document.querySelector('#search').value = '人事';
  document.querySelector('#search').dispatchEvent(new dom.window.Event('input'));
  assert.equal(document.querySelectorAll('#tools a').length, 1);
});

test("Disable controls while loading or after failure and offer a forced refresh", (t) => {
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  assert.equal(document.querySelector('#search').disabled, true);
  assert.equal(document.querySelector('#view-list').disabled, true);
  requests[0].failure();
  assert.equal(document.querySelector('#search').disabled, true);
  assert.equal(document.querySelector('#directory').getAttribute('aria-busy'), 'false');
  assert.equal(document.querySelector('#reload'), null);
  assert.equal(document.querySelectorAll('#tool-rows tr').length, 0);
  assert.equal(document.querySelector('#table-view').hidden, true);
  assert.match(document.querySelector('#status-description').textContent, /最新データを取得/);
});

test("Replace loading state with tools that open in new tabs", (t) => {
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  assert.equal(document.querySelector('#status').hidden, true);
  assert.equal(document.querySelector('#status-title').textContent, '');
  assert.equal(document.querySelector('#status-description').textContent, '');
  assert.equal(document.querySelector('#refresh-catalog').getAttribute('aria-busy'), 'true');
  requests[0].success(catalog);
  const links = document.querySelectorAll('#tools a');
  assert.equal(links.length, 2);
  assert.equal(links[0].target, '_blank');
  assert.equal(links[0].rel, 'noopener noreferrer');
  assert.equal(document.querySelector('#status').hidden, true);
});

test("Normalize full-width characters, case, and whitespace while combining tags", (t) => {
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  requests[0].success(catalog);
  const search = document.querySelector('#search');
  search.value = ' ＧＵＩＤＥ ';
  search.dispatchEvent(new dom.window.Event('input'));
  assert.equal(document.querySelectorAll('#tools a').length, 1);
  [...document.querySelectorAll('#tags button')].find((button) => button.textContent === '業務').click();
  assert.equal(document.querySelectorAll('#tools a').length, 0);
  assert.match(document.querySelector('#status-title').textContent, /表示する項目がありません/);
  document.querySelector('#reset').click();
  assert.equal(document.querySelectorAll('#tools a').length, 2);
});

test("Search descriptions", (t) => {
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  requests[0].success(catalog);
  document.querySelector('#search').value = 'メール';
  document.querySelector('#search').dispatchEvent(new dom.window.Event('input'));
  assert.equal(document.querySelectorAll('#tools a').length, 1);
});

test("Distinguish an empty catalog from entries excluded due to data issues", (t) => {
  for (const issues of [[], [{ row: 2, message: 'URL が不正です。' }]]) {
    const { dom, document, requests } = browser();
    t.after(() => dom.window.close());
    requests[0].success({ ok: true, tools: [], issues });
    assert.match(document.querySelector('#status-title').textContent, issues.length ? /表示できる/ : /表示する項目がありません/);
    assert.equal(document.querySelector('#warnings').hidden, issues.length === 0);
  }
});

test("Show transport and server failures and recover after reopening", (t) => {
  for (const fail of [(request) => request.failure(new Error('private-id')), (request) => request.success({ ok: false })]) {
    const { dom, document, requests } = browser();
    t.after(() => dom.window.close());
    fail(requests[0]);
    assert.match(document.querySelector('#status-title').textContent, /取得できません/);
    assert.doesNotMatch(document.body.textContent, /private-id/);
    assert.match(document.querySelector('#status-description').textContent, /最新データを取得/);
  }
  const fresh = browser();
  t.after(() => fresh.dom.window.close());
  fresh.requests[0].success(catalog);
  assert.equal(fresh.document.querySelectorAll('#tools a').length, 2);
  assert.equal(fresh.document.querySelector('#search').disabled, false);
});

test("Render names, descriptions, tags, and warnings as text in both views", (t) => {
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  const payload = '<img src=x onerror="window.attacked=true">';
  requests[0].success({ ok: true,
    tools: [{ ...catalog.tools[0], name: payload, description: payload, tags: [payload] }],
    issues: [{ row: 3, message: payload }],
  });
  assert.equal(document.querySelectorAll('img:not(.tool-favicon img), [onerror]').length, 0);
  assert.equal(dom.window.attacked, undefined);
  assert.ok(document.body.textContent.includes(payload));
  document.querySelector('#view-list').click();
  assert.equal(document.querySelectorAll('img:not(.tool-favicon img), [onerror]').length, 0);
  assert.equal(dom.window.attacked, undefined);
  assert.ok(document.querySelector('#tool-rows').textContent.includes(payload));
});

test("Reject malformed links and web credentials in the browser", (t) => {
  for (const url of ['not a url', '/relative', 'https://user:pass@example.com']) {
    const { dom, document, requests } = browser();
    t.after(() => dom.window.close());
    requests[0].success({ ...catalog, tools: [{ ...catalog.tools[0], url }] });
    assert.equal(document.querySelectorAll('#tools a').length, 0, url);
    assert.match(document.querySelector('#status-title').textContent, /取得できません/, url);
  }
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  requests[0].success({ ...catalog, tools: [{ ...catalog.tools[0], url: 'https://user:pass@example.com' }] });
  assert.equal(document.querySelectorAll('#tools a').length, 0);
  assert.match(document.querySelector('#status-title').textContent, /取得できません/);
});

test("Ignore successful responses that arrive after timeout", (t) => {
  const timers = [];
  const { dom, document, requests } = browser((window) => {
    window.setTimeout = (callback) => { timers.push(callback); return timers.length; };
    window.clearTimeout = () => {};
  });
  t.after(() => dom.window.close());
  timers[0]();
  assert.match(document.querySelector('#status-title').textContent, /取得できません/);
  requests[0].success(catalog);
  assert.equal(document.querySelectorAll('#tools a').length, 0);
  assert.match(document.querySelector('#status-title').textContent, /取得できません/);
  assert.match(document.querySelector('#status-description').textContent, /最新データを取得/);
});

test("Render multiple related links as independent safe links in both views", (t) => {
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  const relatedLinks = [
    { label: '使い方', url: 'https://example.com/manual' },
    { label: '<img src=x onerror=alert(1)>', url: 'https://example.com/source' },
  ];
  requests[0].success(plain(server({ values: sheetRows([entry({ relatedLinks }), entry({ id: 'other' })]) }).context.getCatalog()));
  for (const container of ['#tools', '#tool-rows']) {
    if (container === '#tool-rows') document.querySelector('#view-list').click();
    const links = [...document.querySelectorAll(`${container} .related-links a`)];
    assert.deepEqual(links.map((link) => link.href), relatedLinks.map((link) => link.url));
    links.forEach((link, index) => {
      assert.ok(link.textContent.includes(relatedLinks[index].label));
      assert.equal(link.target, '_blank');
      assert.equal(link.rel, 'noopener noreferrer');
      assert.equal(link.parentElement.closest('a'), null);
      assert.match(link.textContent, /新しいタブ/);
    });
    assert.equal(document.querySelectorAll(`${container} .related-links`).length, 1);
    assert.equal(document.querySelectorAll('img:not(.tool-favicon img, .related-favicon img), [onerror]').length, 0);
    assert.equal(document.querySelectorAll(`${container} .related-links .related-favicon img`).length, 2);
    assert.equal(document.querySelector(`${container} a`).href, entry().url);
    assert.doesNotMatch(document.querySelector(container).textContent, /↗/);
    for (const link of document.querySelectorAll(`${container} a`)) {
      assert.equal(link.target, '_blank');
      assert.equal(link.rel, 'noopener noreferrer');
    }
  }
  assert.equal(document.querySelectorAll('#tool-rows tr')[1].lastElementChild.textContent, '—');
});

test("Support legacy responses without related links and reject invalid links", (t) => {
  for (const relatedLinks of [null, {}, [null], [{ label: '', url: 'https://example.com' }],
    [{ label: '使い方', url: 'not a url' }], [{ label: '使い方', url: 'https://user:pass@example.com' }]]) {
    const { dom, document, requests } = browser();
    t.after(() => dom.window.close());
    requests[0].success({ ...catalog, tools: [{ ...catalog.tools[0], relatedLinks }] });
    assert.equal(document.querySelectorAll('#tools a').length, 0);
    assert.match(document.querySelector('#status-title').textContent, /取得できません/);
  }
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  requests[0].success(catalog);
  assert.equal(document.querySelectorAll('#tools a').length, 2);
  assert.equal(document.querySelectorAll('.related-links').length, 0);
});

test("Render sheet configuration errors as plain text", (t) => {
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  const error = '先頭シートの列を確認してください。<img src=x onerror=alert(1)>';
  requests[0].success({ ok: false, error });
  assert.equal(document.querySelector('#status-description').textContent, error);
  assert.equal(document.querySelectorAll('img').length, 0);
  assert.equal(document.querySelector('#search').disabled, true);
});

test("Report actual spreadsheet row numbers including blank rows", (t) => {
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  const { context } = server({ values: [
    ['id', 'name', 'url'], [], ['bad', '不正なツール', 'not-a-url'],
  ] });
  requests[0].success(plain(context.getCatalog()));
  assert.match(document.querySelector('#warning-list').textContent, /3 行目/);
  assert.match(document.querySelector('#warning-summary').textContent, /スプレッドシート/);
});

test("Animate changed results while preserving the latest state and focus", (t) => {
  const animations = [];
  const { dom, document, requests } = browser((window) => {
    window.matchMedia = () => ({ matches: false, addEventListener() {} });
    window.HTMLElement.prototype.animate = function () {
      const animation = { target: this.id, cancelled: false, cancel() { this.cancelled = true; } };
      animations.push(animation);
      return animation;
    };
  });
  t.after(() => dom.window.close());
  requests[0].success(catalog);
  const search = document.querySelector('#search');
  search.focus();
  const input = (value) => {
    search.value = value;
    search.dispatchEvent(new dom.window.Event('input'));
  };
  input('guide');
  input('GUIDE');
  assert.equal(animations.length, 2, 'Do not animate unchanged results');
  input('該当なし');
  input('');
  assert.equal(animations.length, 4);
  assert.ok(animations.slice(0, -1).every((animation) => animation.cancelled));
  assert.ok(animations.every((animation) => animation.target === 'results'));
  assert.equal(document.activeElement, search);
  assert.equal(document.querySelectorAll('#tools > li').length, 2);
  document.querySelector('#view-list').click();
  assert.equal(document.querySelectorAll('#tool-rows tr').length, 2);
  assert.equal(animations.length, 5);
});

test("Respect reduced motion and stop active animations when the preference changes", (t) => {
  let change;
  let played = 0;
  let cancelled = 0;
  const media = { matches: true, addEventListener(event, callback) { change = callback; } };
  const { dom, document, requests } = browser((window) => {
    window.matchMedia = (query) => query === '(prefers-reduced-motion: reduce)' ? media : { matches: false, addEventListener() {} };
    window.HTMLElement.prototype.animate = () => {
      played++;
      return { cancel() { cancelled++; } };
    };
  });
  t.after(() => dom.window.close());
  requests[0].success(catalog);
  document.querySelector('#view-list').click();
  assert.equal(played, 0);
  assert.equal(document.querySelectorAll('#tool-rows tr').length, 2);
  media.matches = false;
  change();
  document.querySelector('#view-cards').click();
  assert.equal(played, 1);
  media.matches = true;
  change();
  assert.equal(cancelled, 1);
  assert.equal(document.querySelectorAll('#tools > li').length, 2);
});

test("Preserve filters and view across tabs without extra API calls", (t) => {
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  requests[0].success(catalog);
  const toolsTab = document.querySelector('#tab-tools');
  const actionsTab = document.querySelector('#tab-actions');
  const search = document.querySelector('#search');
  search.value = 'guide';
  search.dispatchEvent(new dom.window.Event('input'));
  [...document.querySelectorAll('#tags button')].find((button) => button.textContent === '資料').click();
  document.querySelector('#view-list').click();
  actionsTab.click();
  assert.equal(document.querySelector('#directory').hidden, true);
  assert.equal(document.querySelector('#actions-panel').hidden, false);
  assert.equal(document.querySelector('#action-items').children.length, 0);
  assert.equal(actionsTab.getAttribute('aria-selected'), 'true');
  assert.equal(toolsTab.tabIndex, -1);
  toolsTab.click();
  assert.equal(document.querySelector('#actions-panel').hidden, true);
  assert.equal(document.querySelector('#directory').hidden, false);
  assert.equal(search.value, 'guide');
  assert.equal(document.querySelector('#table-view').hidden, false);
  assert.equal(document.querySelectorAll('#tool-rows tr').length, 1);
  assert.equal([...document.querySelectorAll('#tags button')].find((button) => button.textContent === '資料').getAttribute('aria-pressed'), 'true');
  assert.equal(requests.length, 1);
});

test("Support arrow, Home, and End navigation without changing tabs on loading or failure", (t) => {
  for (const complete of [(request) => request.success(catalog), (request) => request.failure()]) {
    const { dom, document, requests } = browser();
    t.after(() => dom.window.close());
    const toolsTab = document.querySelector('#tab-tools');
    const actionsTab = document.querySelector('#tab-actions');
    const settingsTab = document.querySelector('#tab-settings');
    const key = (button, value) => button.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: value, bubbles: true }));
    toolsTab.focus();
    key(toolsTab, 'ArrowLeft');
    assert.equal(document.activeElement, settingsTab);
    assert.equal(settingsTab.getAttribute('aria-selected'), 'true');
    complete(requests[0]);
    assert.equal(document.querySelector('#directory').hidden, true);
    assert.equal(document.querySelector('#settings-panel').hidden, false);
    key(settingsTab, 'ArrowRight');
    assert.equal(document.activeElement, toolsTab);
    key(toolsTab, 'End');
    assert.equal(document.activeElement, settingsTab);
    key(settingsTab, 'Home');
    assert.equal(document.activeElement, toolsTab);
    assert.equal(toolsTab.getAttribute('aria-selected'), 'true');
    assert.equal(toolsTab.tabIndex, 0);
    assert.equal(actionsTab.tabIndex, -1);
    for (const button of [toolsTab, actionsTab, settingsTab]) {
      assert.equal(document.getElementById(button.getAttribute('aria-controls')).getAttribute('aria-labelledby'), button.id);
    }
  }
});

test('Show stable filtered and total counts after the filter controls in both languages', (t) => {
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  const count = document.getElementById('count');
  assert.equal(document.querySelector('#tab-tools #count'), null);
  assert.ok(count.previousElementSibling.classList.contains('view-switch'));
  assert.equal(count.parentElement.className, 'filter-toolbar');
  assert.equal(count.closest('#directory').id, 'directory');
  assert.equal(count.textContent, '');
  requests[0].success({ ...catalog, tools: [
    { ...catalog.tools[0], name: 'Alpha', scope: 'internal', tags: ['Work'] },
    { ...catalog.tools[1], name: 'Beta', scope: 'external', tags: ['Work'] },
  ] });
  assert.equal(count.textContent, '2 / 2 件');
  assert.equal(count.style.getPropertyValue('--count-digits'), '1');
  document.getElementById('scope-internal').click();
  assert.equal(count.textContent, '1 / 2 件');
  document.getElementById('scope-all').click();
  [...document.querySelectorAll('#tags button')].find((button) => button.textContent === 'Work').click();
  assert.equal(count.textContent, '2 / 2 件', 'An active filter is shown even when all items match');
  const search = document.getElementById('search');
  search.value = 'not-found'; search.dispatchEvent(new dom.window.Event('input'));
  assert.equal(count.textContent, '0 / 2 件');
  document.documentElement.lang = 'en';
  document.dispatchEvent(new dom.window.Event('portal:languagechange'));
  assert.equal(count.textContent, '0 / 2 items');
  document.getElementById('reset').click();
  assert.equal(count.textContent, '2 / 2 items');
  assert.equal(count.style.getPropertyValue('--count-digits'), '1');
});

test('Use only the refresh spinner during initial loading, refresh, and retry after errors', (t) => {
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  const refresh = document.getElementById('refresh-catalog');
  const status = document.getElementById('status');
  const assertLoading = () => {
    assert.equal(refresh.getAttribute('aria-busy'), 'true');
    assert.equal(refresh.disabled, true);
    assert.equal(status.hidden, true);
    assert.equal(document.getElementById('status-title').textContent, '');
    assert.equal(document.getElementById('status-description').textContent, '');
  };
  assertLoading();
  requests[0].success(catalog);
  assert.equal(refresh.getAttribute('aria-busy'), 'false');
  refresh.click(); assertLoading();
  requests[1].failure();
  assert.equal(status.hidden, false);
  assert.match(status.textContent, /取得できません/);
  refresh.click(); assertLoading();
  requests[2].success({ ok: true, tools: [], issues: [] });
  assert.equal(refresh.getAttribute('aria-busy'), 'false');
  assert.equal(status.hidden, false);
  assert.match(status.textContent, /表示する項目がありません/);
});

const googleFavicon = (origin) => 'https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=64&url=' + encodeURIComponent(origin);

test('Favicons try the site itself, then Google, sending only the origin or hostname', (t) => {
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  requests[0].success({ ...catalog, tools: [{ ...catalog.tools[0],
    url: 'https://GitHub.com:443/company/private?token=secret#fragment',
    relatedLinks: [{ url: 'https://example.org/private', label: 'Related' }],
  }] });
  const image = document.querySelector('#tools .tool-favicon img');
  assert.equal(image.src, 'https://github.com/favicon.ico');
  assert.equal(image.loading, 'lazy');
  assert.equal(image.decoding, 'async');
  assert.equal(image.referrerPolicy, 'no-referrer');
  assert.equal(image.alt, '');
  assert.equal(image.width, 20);
  assert.equal(image.parentElement.getAttribute('aria-hidden'), 'true');
  image.dispatchEvent(new dom.window.Event('error'));
  assert.equal(image.src, googleFavicon('https://github.com'));
  assert.doesNotMatch(image.src, /company|private|token|secret|fragment/);
  const related = document.querySelector('#tools .related-favicon img');
  assert.equal(related.src, 'https://example.org/favicon.ico');
  assert.equal(related.width, 14);
  assert.equal(related.referrerPolicy, 'no-referrer');
  assert.equal(related.closest('a').textContent.includes('Related'), true);
  related.dispatchEvent(new dom.window.Event('error'));
  assert.equal(related.src, googleFavicon('https://example.org'));
  Object.defineProperties(image, { naturalWidth: { value: 64 }, naturalHeight: { value: 64 } });
  image.dispatchEvent(new dom.window.Event('load'));
  assert.equal(image.parentElement.classList.contains('is-loaded'), true);
  document.querySelector('#view-list').click();
  assert.equal(document.querySelector('#tool-rows .tool-favicon img').src, 'https://github.com/favicon.ico');
  assert.equal(document.querySelectorAll('#tool-rows .related-favicon img').length, 1);
  assert.equal(document.querySelector('#tool-rows a').target, '_blank');
});

test('Favicons keep the emoji fallback after every source fails and do not delay the catalog', (t) => {
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  requests[0].success(catalog);
  assert.equal(document.querySelector('#directory').getAttribute('aria-busy'), 'false');
  assert.equal(document.querySelector('#search').disabled, false);
  const frame = document.querySelector('#tools .tool-favicon');
  const image = frame.querySelector('img');
  image.dispatchEvent(new dom.window.Event('error'));
  assert.equal(frame.contains(image), true, 'The second source is still pending');
  image.dispatchEvent(new dom.window.Event('error'));
  assert.equal(frame.querySelector('img'), null);
  assert.equal(frame.querySelector('.tool-favicon-fallback').textContent, '🌐');
  assert.equal(frame.classList.contains('is-loaded'), false);
  assert.equal(document.querySelectorAll('#tools .tool-card').length, 2);
});

test('Private hosts request only their own favicon, never the external service', (t) => {
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  const urls = ['https://localhost:3000', 'https://intranet', 'https://127.0.0.1',
    'https://10.0.0.1', 'https://8.8.8.8', 'https://2130706433', 'https://[::1]',
    'https://[2001:db8::1]', 'https://office.local', 'https://private.internal',
    'https://router.home.arpa', 'https://app.localhost.', 'https://app.lan',
    'https://app.home', 'https://app.test', 'https://app.invalid', 'https://app.onion'];
  requests[0].success({ ...catalog, tools: urls.map((url, i) => ({ ...catalog.tools[0], id: String(i), url })) });
  for (const container of ['#tools', '#tool-rows']) {
    if (container === '#tool-rows') document.querySelector('#view-list').click();
    const images = [...document.querySelectorAll(`${container} .tool-favicon img`)];
    assert.equal(images.length, urls.length, container);
    images.forEach((image, index) => {
      assert.equal(image.src, new URL(urls[index]).origin + '/favicon.ico', urls[index]);
      image.dispatchEvent(new dom.window.Event('error'));
      assert.equal(image.isConnected, false, 'No second source for ' + urls[index]);
    });
  }
});

test('Favicons skip mixed-content requests and non-web schemes', (t) => {
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  const urls = ['http://example.com/path', 'http://localhost:4174/', 'vscode://file/Users/me/project', 'mailto:a@example.com'];
  requests[0].success({ ...catalog, tools: urls.map((url, i) => ({ ...catalog.tools[0], id: String(i), url })) });
  const frames = [...document.querySelectorAll('#tools .tool-favicon')];
  assert.deepEqual(frames.map((frame) => frame.querySelector('img')?.src ?? null),
    [googleFavicon('http://example.com'), null, null, null]);
  assert.ok(frames.every((frame) => frame.querySelector('.tool-favicon-fallback').textContent === '🌐'));
});

test('Scale small icons to the display size and skip placeholder pixels', (t) => {
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  requests[0].success(catalog);
  for (const view of ['cards', 'list']) {
    document.querySelector('#view-' + view).click();
    const container = view === 'cards' ? '#tools' : '#tool-rows';
    const load = (index, size) => {
      const image = document.querySelectorAll(`${container} .tool-favicon img`)[index];
      Object.defineProperties(image, { naturalWidth: { value: size }, naturalHeight: { value: size } });
      image.dispatchEvent(new dom.window.Event('load'));
      return image;
    };
    const small = load(0, 16);
    assert.equal(small.parentElement.classList.contains('is-loaded'), true);
    assert.deepEqual([small.width, small.height], [20, 20], 'Enlarge 16px icons to match the others');
    const placeholder = load(1, 1);
    assert.equal(placeholder.parentElement.classList.contains('is-loaded'), false);
    assert.match(placeholder.src, /^https:\/\/t2\.gstatic\.com\/faviconV2/, 'A 1px image is not an icon');
  }
});

test('Scope badges add distinct shape icons and keep their text labels', (t) => {
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  document.getElementById('scope-icon-internal').innerHTML = '<svg class="building-2-icon" aria-hidden="true"></svg>';
  document.getElementById('scope-icon-external').innerHTML = '<svg class="globe-icon" aria-hidden="true"></svg>';
  requests[0].success({ ...catalog, tools: [catalog.tools[0], { ...catalog.tools[1], scope: 'external' }] });
  const badges = [...document.querySelectorAll('#tools .scope-badge')];
  assert.deepEqual(badges.map((badge) => badge.textContent), ['社内', '社外']);
  assert.deepEqual(badges.map((badge) => badge.querySelector('svg')?.getAttribute('class')), ['building-2-icon', 'globe-icon']);
  assert.ok(badges.every((badge) => badge.querySelector('svg').getAttribute('aria-hidden') === 'true'));
  assert.equal(document.getElementById('scope-icon-internal').content.querySelectorAll('svg').length, 1, 'Templates stay reusable');
  document.querySelector('#view-list').click();
  assert.equal(document.querySelectorAll('#tool-rows .scope-badge svg').length, 2);
});

test('Scope badges still render text when icon templates are unavailable', (t) => {
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  document.getElementById('scope-icon-internal').remove();
  requests[0].success(catalog);
  const badge = document.querySelector('#tools .scope-badge');
  assert.equal(badge.textContent, '社内');
  assert.equal(badge.querySelector('svg'), null);
});

test('Spreadsheet icons override detection: text replaces the fallback, and an image URL is tried first', (t) => {
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  requests[0].success({ ...catalog, tools: [
    { ...catalog.tools[0], icon: '📘' },
    { ...catalog.tools[1], url: 'https://app.example.com/home', icon: 'https://www.example.com/favicon.ico' },
  ] });
  for (const container of ['#tools', '#tool-rows']) {
    if (container === '#tool-rows') document.querySelector('#view-list').click();
    const [text, image] = document.querySelectorAll(`${container} .tool-favicon`);
    assert.equal(text.querySelector('img'), null, 'Text icons make no image request');
    assert.equal(text.classList.contains('is-text'), true);
    assert.equal(text.textContent, '📘');
    assert.equal(text.getAttribute('aria-hidden'), 'true');
    const img = image.querySelector('img');
    assert.equal(img.src, 'https://www.example.com/favicon.ico');
    img.dispatchEvent(new dom.window.Event('error'));
    assert.equal(img.src, 'https://app.example.com/favicon.ico', 'Fall back to automatic detection');
  }
});

test('Reject malformed icons in the browser', (t) => {
  for (const icon of ['', ' ', 'two words', 'ABCDEFGHI', 'https://user:pass@example.com/i.png', 42]) {
    const { dom, document, requests } = browser();
    t.after(() => dom.window.close());
    requests[0].success({ ...catalog, tools: [{ ...catalog.tools[0], icon }] });
    assert.match(document.querySelector('#status-title').textContent, /取得できません/, String(icon));
  }
});
