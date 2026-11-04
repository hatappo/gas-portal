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
  assert.match(document.querySelector('#status-title').textContent, /読み込み/);
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
  assert.match(document.querySelector('#status-title').textContent, /見つかりません/);
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
    assert.match(document.querySelector('#status-title').textContent, issues.length ? /表示できる/ : /登録されていません/);
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
  assert.equal(document.querySelectorAll('img').length, 0);
  assert.equal(dom.window.attacked, undefined);
  assert.ok(document.body.textContent.includes(payload));
  document.querySelector('#view-list').click();
  assert.equal(document.querySelectorAll('img').length, 0);
  assert.equal(dom.window.attacked, undefined);
  assert.ok(document.querySelector('#tool-rows').textContent.includes(payload));
});

test("Reject non-HTTPS links in the browser", (t) => {
  const { dom, document, requests } = browser();
  t.after(() => dom.window.close());
  requests[0].success({ ...catalog, tools: [{ ...catalog.tools[0], url: 'javascript:alert(1)' }] });
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
    assert.equal(document.querySelectorAll('img').length, 0);
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
    [{ label: '使い方', url: 'javascript:alert(1)' }], [{ label: '使い方', url: 'https://user:pass@example.com' }]]) {
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
    ['id', 'name', 'url'], [], ['bad', '不正なツール', 'javascript:alert(1)'],
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
