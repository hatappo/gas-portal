import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readRepositoryUrl } from './repository-url.mjs';

/** Share links and licensed SVG assets between development and production, without an external CDN. */
export function withPortalAssets(html, root) {
  const icon = readFileSync(path.join(root, 'src/assets/external-link.svg'), 'utf8');
  const repositoryUrl = readRepositoryUrl(root);
  const link = repositoryUrl ? `<a class="footer-link repository-link" href="${repositoryUrl}" target="_blank" rel="noopener noreferrer">GitHub <!-- external-link-icon --><span class="visually-hidden" data-i18n="(opens in a new tab)">(opens in a new tab)</span></a>` : '';
  return html.replace('<!-- repository-link -->', link).replaceAll('<!-- external-link-icon -->', icon);
}
