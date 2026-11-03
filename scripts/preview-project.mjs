import { readFileSync } from 'node:fs';

/** GAS の通常の出力タグと同じく、文言を HTML として実行させない。 */
export function withPreviewContent(html, portal, theme = 'tsuyukusa') {
  const escapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return html.replace('<?= theme ?>', () => theme.replace(/[&<>"']/g, (character) => escapes[character]))
    .replace(/<\? if \(portal\.spreadsheetUrl\) \{ \?>([\s\S]*?)<\? \} \?>/g,
    (_, content) => portal.spreadsheetUrl ? content : '')
    .replace(/<\?= portal\.(name|brandLead|brandRest|headline|description|spreadsheetUrl|icon|defaultsJson) \?>/g,
    (_, key) => portal[key].replace(/[&<>"']/g, (character) => escapes[character]));
}

/** ローカル限定。接続先が未設定ならリンクを隠し、認証情報は読み込まない。 */
export function withPreviewProject(html, configUrl = new URL('../.clasp.json', import.meta.url)) {
  let scriptId;
  try {
    scriptId = JSON.parse(readFileSync(configUrl, 'utf8')).scriptId;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (scriptId !== undefined && (typeof scriptId !== 'string' || !/^[\w-]+$/.test(scriptId))) {
    throw new Error('.clasp.json の scriptId が不正です。');
  }
  const attribute = scriptId ? `href="https://script.google.com/home/projects/${scriptId}/edit"` : 'hidden';
  return html.replace('href="<?= projectUrl ?>"', attribute);
}
