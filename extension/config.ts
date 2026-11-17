export interface PanelPage { id: string; name: string; url: string }
export interface PanelConfig { pages: PanelPage[]; activePageId: string }
export const emptyConfig = (): PanelConfig => ({ pages: [], activePageId: '' });

/** A display-only fallback: never overwrite an intentionally blank saved name. */
export function pageLabel(page: PanelPage): string {
  if (page.name.trim()) return page.name.trim();
  try { return new URL(page.url).host; } catch { return ''; }
}

/** Keep the placeholder readable in settings; it is expanded only when opening a page. */
export function normalizePageUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== 'https:' || url.username || url.password || /[{}]/.test(url.host)) return null;
    return url.href.replace(/%7Bnonce%7D/gi, '{nonce}');
  } catch { return null; }
}
export function validateConfig(input: PanelConfig): PanelConfig {
  if (!Array.isArray(input.pages) || input.pages.length > 20) throw new Error('You can save up to 20 pages.');
  const ids = new Set<string>();
  const pages = input.pages.map(page => {
    if (!page.id || ids.has(page.id) || typeof page.name !== 'string') throw new Error('Invalid page settings.');
    ids.add(page.id);
    if (/^chrome:/i.test(page.url.trim())) throw new Error('Chrome internal pages cannot be displayed in a side panel. Open them in a browser tab.');
    const url = normalizePageUrl(page.url);
    if (!url) throw new Error('Enter an HTTPS URL without a username or password.');
    return { id: page.id, name: page.name.trim(), url };
  });
  return { pages, activePageId: pages.some(page => page.id === input.activePageId) ? input.activePageId : pages[0]?.id || '' };
}
/** Convert experimental parameter sets to URLs without retaining them in the new model. */
export function restoreConfig(saved: { panelConfig?: unknown; portalUrl?: unknown }): PanelConfig {
  if (saved.panelConfig !== undefined) {
    const previous = saved.panelConfig as PanelConfig & { parameterSets?: { id: string; parameters: string }[] };
    const pages = previous.pages.map(page => {
      const setId = (page as PanelPage & { parameterSetId?: string }).parameterSetId;
      const set = previous.parameterSets?.find(item => item.id === setId);
      if (!set) return page;
      const url = new URL(page.url);
      for (const line of set.parameters.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const separator = line.indexOf('=');
        if (separator < 1) throw new Error('Invalid saved parameters');
        url.searchParams.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
      }
      return { ...page, url: url.href };
    });
    return validateConfig({ pages, activePageId: previous.activePageId });
  }
  if (typeof saved.portalUrl === 'string' && normalizePageUrl(saved.portalUrl)) {
    const url = new URL(saved.portalUrl);
    url.searchParams.set('sidePanel', '1');
    url.searchParams.set('panelNonce', '{nonce}');
    return validateConfig({ pages: [{ id: 'portal', name: 'GAS Portal', url: url.href }], activePageId: 'portal' });
  }
  return emptyConfig();
}
export function pageRequest(config: PanelConfig, nonce: string): string | null {
  const page = config.pages.find(page => page.id === config.activePageId);
  if (!page) return null;
  if (!/^[a-f0-9]{32}$/.test(nonce)) throw new Error('Invalid panel nonce');
  return page.url.replaceAll('{nonce}', nonce);
}
