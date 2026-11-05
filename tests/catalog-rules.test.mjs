import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const rules = (() => {
  const context = vm.createContext({});
  vm.runInContext(readFileSync('src/shared/catalog-rules.js', 'utf8'), context);
  return context.PortalCatalogRules;
})();

const accepted = [
  'https://example.com', 'https://example.com:8443/a?b=c#d', 'http://localhost:4174/', 'https://10.0.0.1',
  'https://192.168.1.255/x', 'https://xn--r8jz45g.jp/', 'https://example.com/a|b^c', 'https://example.com:',
  'ws://localhost:8080/socket', 'wss://example.com', 'ftp://files.example.com/pub',
  'vscode://file/Users/me/project', 'vscode-insiders://file/c:/work', 'ssh://git@github.com/org/repo.git',
  'smb://server/share/x', 'slack://open', 'mailto:a@example.com', 'search-ms:query=x', 'javascript:alert(1)',
  'data:text/html,%3Cb%3Ex%3C/b%3E', 'file:///Users/me/a.txt', 'file://server/share', 'x:' + 'a'.repeat(2046),
];
const rejected = [
  '', 'example.com', '//example.com', 'vscode:', 'https://', 'https:example.com', 'https://user:pass@example.com',
  'http://user@example.com', 'https://-bad.com', 'https://exa mple.com', 'https://example.com/<x>', 'https://example.com/%zz',
  'https://example.com:99999', 'https://1.2.3.999/', 'https://999.1.1.1', 'https://192.168.1.300/', 'https://2130706433',
  'https://1.2.3', 'https://[::1]', 'https://app.localhost.', 'wss://a:99999', 'ws://[', 'ftp://[', 'ftp://a:b@[',
  'ssh://git@github.com:org/repo.git', 'smb://server:share/x', 'vscode://[x', 'vscode://h:99999', 'vscode://a^b/', 'vscode://:0/x', 'vscode://u@/x',
  'file://a:1/x', 'file://u@h/x', 'file:relative', 'mailto: a@example.com', 'x:' + 'a'.repeat(2047),
];

test('Accept well-formed URLs of any scheme', () => {
  for (const url of accepted) assert.equal(rules.isValidLinkUrl(url), true, url);
});

test('Reject malformed URLs, web credentials, and hosts or ports the browser would reject', () => {
  for (const url of rejected) assert.equal(rules.isValidLinkUrl(url), false, url);
});

test('Every URL the shared rules accept also parses with the WHATWG URL parser', () => {
  const hosts = ['example.com', 'a', '1.2.3.4', '1.2.3.999', '999.1.1.1', '[::1]', '[x', 'a:b', 'h:99999', 'h:', 'a^b', 'a|b', 'u@h', 'u:p@h', ''];
  const ports = ['', ':0', ':80', ':65535', ':65536', ':x'];
  const schemes = ['https', 'http', 'ws', 'wss', 'ftp', 'file', 'vscode', 'ssh', 'smb', 'mailto', 'data'];
  let checked = 0;
  for (const scheme of schemes) {
    for (const host of hosts) {
      for (const port of ports) {
        for (const candidate of [`${scheme}://${host}${port}/path`, `${scheme}:${host}${port}`]) {
          if (!rules.isValidLinkUrl(candidate)) continue;
          checked++;
          assert.doesNotThrow(() => new URL(candidate), candidate);
        }
      }
    }
  }
  assert.ok(checked > 100, `checked ${checked} accepted candidates`);
});

test('Accept https image URLs or short text as icons, and blank as none', () => {
  for (const icon of ['', '  ', 'https://example.com/i.png', '📘', 'HS', '👨‍👩‍👧‍👦']) assert.equal(rules.isValidIcon(icon), true, icon);
  for (const icon of ['http://example.com/i.png', 'https://1.2.3.999/i.png', 'data:image/png;base64,AA', 'two words', 'ABCDEFGHI', 42, null]) {
    assert.equal(rules.isValidIcon(icon), false, String(icon));
  }
});
