import { existsSync, lstatSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GAS_FILES, generatedRoot, packageInfo, packageRoot, prepareClasp, readConfig } from './config.mjs';
import { githubUrl, readRepositoryUrl } from './repository-url.mjs';

export function repositoryLink(html, root, config) {
  const url = config.repositoryUrl === undefined ? readRepositoryUrl(root) : githubUrl(config.repositoryUrl);
  const icon = readFileSync(new URL('assets/external-link.svg', packageRoot), 'utf8');
  const link = url ? `<a class="footer-link repository-link" href="${url}" target="_blank" rel="noopener noreferrer">GitHub ${icon}<span class="visually-hidden" data-i18n="(opens in a new tab)">(opens in a new tab)</span></a>` : '';
  return html.replace('<!-- portal-repository-link -->', () => link);
}

/** Prepare all output before replacement; never modify installed package files. */
export function replaceGeneratedDirectory(root, name, files) {
  const dir = generatedRoot(root);
  const output = path.join(dir, name);
  if (existsSync(output) && (!lstatSync(output).isDirectory() || lstatSync(output).isSymbolicLink())) throw new Error(`${output} is not a regular directory.`);
  const temporary = mkdtempSync(path.join(dir, name + '-'));
  try {
    for (const [file, content] of Object.entries(files)) writeFileSync(path.join(temporary, file), content);
    rmSync(output, { recursive: true, force: true });
    renameSync(temporary, output);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
  return output;
}

export function build(root) {
  const config = readConfig(root);
  const files = Object.fromEntries(GAS_FILES.map((file) => [file, readFileSync(new URL(`assets/gas/${file}`, packageRoot), 'utf8')]));
  files['Index.html'] = repositoryLink(files['Index.html'], root, config);
  const output = replaceGeneratedDirectory(root, 'dist', files);
  if (config.scriptId) prepareClasp(root, config);
  return { output, version: packageInfo.version, files: GAS_FILES };
}

export function configurePreviewHtml(html, root) {
  const config = readConfig(root);
  html = repositoryLink(html, root, config).replace('data-portal-project-link', config.scriptId ? `href="https://script.google.com/home/projects/${config.scriptId}/edit"` : 'hidden');
  // Isolate environments even when they share the same localhost origin.
  const namespace = Buffer.from(path.resolve(root)).toString('base64url');
  html = html.replaceAll('portal-preview-source', `portal-preview-source-${namespace}`).replaceAll('portal-preview-cache-seconds', `portal-preview-cache-seconds-${namespace}`).replaceAll('portal-preview-catalog', `portal-preview-catalog-${namespace}`).replaceAll('portal-preview-language', `portal-preview-language-${namespace}`).replaceAll('portal-preview-settings', `portal-preview-settings-${namespace}`).replaceAll('portal-preview-theme', `portal-preview-theme-${namespace}`).replaceAll('portal-preview-actions-cache-seconds', `portal-preview-actions-cache-seconds-${namespace}`);
  return html;
}

export function buildPreview(root) {
  const html = configurePreviewHtml(readFileSync(new URL('assets/preview/index.html', packageRoot), 'utf8'), root);
  return replaceGeneratedDirectory(root, 'preview', {
    'index.html': html,
    'mobile.html': readFileSync(new URL('assets/preview/mobile.html', packageRoot), 'utf8'),
  });
}
