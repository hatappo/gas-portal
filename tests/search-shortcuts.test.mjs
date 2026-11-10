import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { initializeSearchShortcuts } from '../src/browser/search-shortcuts.js';

for (const platform of ['MacIntel', 'Linux x86_64']) {
  test(`Search shortcut preserves queries and respects hidden/disabled panels on ${platform}`, () => {
    const dom = new JSDOM(`<section id="links"><div><input id="search" value="draft"><kbd data-search-shortcut></kbd></div></section>
      <section id="actions" hidden><div><input id="actions-search" value="query"><kbd data-search-shortcut></kbd></div></section>
      <input id="settings">`);
    const { document: root, KeyboardEvent } = dom.window;
    const mac = platform === 'MacIntel';
    const cleanup = initializeSearchShortcuts(root, platform);
    const press = (extra = {}) => {
      const event = new KeyboardEvent('keydown', { key: 'k', metaKey: mac, ctrlKey: !mac, bubbles: true, cancelable: true, ...extra });
      root.activeElement.dispatchEvent(event);
      return event.defaultPrevented;
    };
    assert.equal(root.querySelector('kbd').textContent, mac ? '⌘K' : 'Ctrl K');
    assert.equal(root.getElementById('search').getAttribute('aria-keyshortcuts'), mac ? 'Meta+K' : 'Control+K');
    assert.equal(press(), true);
    assert.equal(root.activeElement.id, 'search');
    assert.equal(root.activeElement.value, 'draft');
    for (const extra of [{ isComposing: true }, { altKey: true }, { shiftKey: true }, { repeat: true }, { metaKey: !mac, ctrlKey: mac }]) {
      assert.equal(press(extra), false);
    }
    root.getElementById('links').hidden = true;
    root.getElementById('actions').hidden = false;
    assert.equal(press(), true);
    assert.equal(root.activeElement.id, 'actions-search');
    assert.equal(root.activeElement.value, 'query');
    root.activeElement.disabled = true;
    root.getElementById('settings').focus();
    assert.equal(press(), false);
    root.getElementById('actions-search').disabled = false;
    root.getElementById('actions').hidden = true;
    assert.equal(press(), false);
    assert.equal(root.activeElement.id, 'settings');
    root.getElementById('actions').hidden = false;
    cleanup();
    assert.equal(press(), false);
    dom.window.close();
  });
}
