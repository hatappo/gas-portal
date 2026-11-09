import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readRepositoryUrl } from '../lib/repository-url.mjs';

/** Share links and licensed SVG assets between development and production, without an external CDN. */
export function withPortalAssets(html, root) {
  const repositoryUrl = readRepositoryUrl(root);
  const link = repositoryUrl ? `<a class="link footer-link repository-link" href="${repositoryUrl}" target="_blank" rel="noopener noreferrer">GitHub <!-- external-link-icon --><span class="visually-hidden" data-i18n="(opens in a new tab)">(opens in a new tab)</span></a>` : '';
  let result = html.replace('<!-- repository-link -->', link);
  for (const name of ['external-link', 'refresh-cw', 'layout-grid', 'list', 'tool-case', 'list-checks', 'settings', 'calendar-days', 'calendar-off', 'pin', 'pin-off', 'bell-off']) {
    const icon = readFileSync(path.join(root, `src/assets/${name}.svg`), 'utf8');
    result = result.replaceAll(`<!-- ${name}-icon -->`, icon);
  }
  return result;
}
