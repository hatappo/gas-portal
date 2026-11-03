import { readFileSync } from 'node:fs';
import path from 'node:path';
import { readRepositoryUrl } from './repository-url.mjs';

/** 開発・本番共通のリンクとライセンス付き SVG。外部 CDN には依存しない。 */
export function withPortalAssets(html, root) {
  const icon = readFileSync(path.join(root, 'src/assets/external-link.svg'), 'utf8');
  const repositoryUrl = readRepositoryUrl(root);
  const link = repositoryUrl ? `<a class="footer-link repository-link" href="${repositoryUrl}" target="_blank" rel="noopener noreferrer">GitHub <!-- external-link-icon --><span class="visually-hidden">（新しいタブで開きます）</span></a>` : '';
  return html.replace('<!-- repository-link -->', link).replaceAll('<!-- external-link-icon -->', icon);
}
