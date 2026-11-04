import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { withPreviewProject, withPreviewContent } from '../scripts/preview-project.mjs';
import { server } from './helpers.mjs';

test("Generate configured project links, hide missing ones, and reject invalid IDs", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'gas-portal-preview-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const config = path.join(root, '.clasp.json');
  const html = readFileSync('src/Index.html', 'utf8');
  const link = () => {
    const dom = new JSDOM(withPreviewProject(html, config));
    t.after(() => dom.window.close());
    return dom.window.document.querySelector('.project-link');
  };
  assert.equal(link().hidden, true);
  for (const scriptId of ['first-project', 'second-project']) {
    writeFileSync(config, JSON.stringify({ scriptId }));
    const anchor = link();
    assert.equal(anchor.href, `https://script.google.com/home/projects/${scriptId}/edit`);
    assert.equal(anchor.target, '_blank');
    assert.equal(anchor.rel, 'noopener noreferrer');
    assert.equal(anchor.hidden, false);
  }
  for (const scriptId of ['"><script>alert(1)</script>', 'https://example.com', null, 123]) {
    writeFileSync(config, JSON.stringify({ scriptId }));
    assert.throws(() => withPreviewProject(html, config), /Invalid scriptId/);
  }
});

test("Escape custom text and keep the document and portal names consistent", (t) => {
  const payload = '</title><img src=x onerror=alert(1)> & "quoted" $&';
  const portal = server().context.getPortalContent_({ PORTAL_NAME: payload, PORTAL_HEADLINE: payload, PORTAL_DESCRIPTION: payload });
  const source = readFileSync('src/Index.html', 'utf8');
  assert.doesNotMatch(source, /<\?!= portal\./);
  const html = withPreviewContent(source, portal).replace(/<\?[\s\S]*?\?>/g, '');
  const dom = new JSDOM(html);
  t.after(() => dom.window.close());
  const document = dom.window.document;
  assert.equal(document.title, payload);
  assert.equal(document.querySelector('.brand-name').textContent, payload);
  assert.equal(document.querySelector('#page-title').textContent, payload);
  assert.equal(document.querySelector('.intro-copy').textContent, payload);
  assert.equal(document.querySelectorAll('img').length, 0);
});

test("Open GAS and spreadsheet links in new tabs and hide unconfigured spreadsheet links", (t) => {
  for (const spreadsheetId of ['', 'test-sheet']) {
    const portal = server().context.getPortalContent_({}, { SPREADSHEET_ID: spreadsheetId });
    const html = withPreviewContent(readFileSync('src/Index.html', 'utf8'), portal);
    const dom = new JSDOM(html);
    t.after(() => dom.window.close());
    const document = dom.window.document;
    assert.equal(document.querySelector('header .project-link'), null);
    const gas = document.querySelector('footer .project-link');
    assert.match(gas.textContent, /^GAS /);
    const sheet = document.querySelector('footer .spreadsheet-link');
    if (!spreadsheetId) assert.equal(sheet, null);
    else assert.equal(sheet.href, 'https://docs.google.com/spreadsheets/d/test-sheet/edit');
    for (const link of document.querySelectorAll('footer a')) {
      assert.equal(link.target, '_blank');
      assert.equal(link.rel, 'noopener noreferrer');
    }
    assert.doesNotMatch(html, /<\? if \(portal\.spreadsheetUrl\)/);
  }
});
