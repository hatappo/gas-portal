import { readFileSync } from 'node:fs';

/** Escape text like GAS output tags so it cannot execute as HTML. */
export function withPreviewContent(html, portal, theme = 'auto') {
  const escapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return html
    .replace('<? if (!portal.headline && !portal.description) { ?>hidden<? } ?>', !portal.headline && !portal.description ? 'hidden' : '')
    .replace('<? if (!portal.headline) { ?>hidden<? } ?>', !portal.headline ? 'hidden' : '')
    .replace('<? if (!portal.description) { ?>hidden<? } ?>', !portal.description ? 'hidden' : '')
    .replace('<?!= themeAttribute ?>', () => theme === 'auto' ? '' : 'data-theme="' + theme.replace(/[&<>"']/g, (character) => escapes[character]) + '"')
    .replace(/<\? if \(portal\.spreadsheetUrl\) \{ \?>([\s\S]*?)<\? \} \?>/g,
    (_, content) => portal.spreadsheetUrl ? content : '')
    .replace(/<\?= portal\.(spreadsheetId|sheetName|cacheSeconds|actionsCacheSeconds|slackBookmarkLimit|unblockedUrlSchemes|languagePreference|language|name|brandLead|brandRest|headline|description|spreadsheetUrl|icon|defaultsJson) \?>/g,
    (_, key) => portal[key].replace(/[&<>"']/g, (character) => escapes[character]));
}

/** Local only: hide the link when no project is configured; never read credentials. */
export function withPreviewProject(html, configUrl = new URL('../.clasp.json', import.meta.url)) {
  let scriptId;
  try {
    scriptId = JSON.parse(readFileSync(configUrl, 'utf8')).scriptId;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (scriptId !== undefined && (typeof scriptId !== 'string' || !/^[\w-]+$/.test(scriptId))) {
    throw new Error('Invalid scriptId in .clasp.json.');
  }
  const attribute = scriptId ? `href="https://script.google.com/home/projects/${scriptId}/edit"` : 'hidden';
  return html.replace('href="<?= projectUrl ?>"', attribute);
}
