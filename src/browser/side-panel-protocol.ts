// Shared by the GAS browser bundle and the extension. This channel carries readiness only.
export const READY_MESSAGE = 'gas-portal:side-panel-ready';
export function normalizePortalUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (url.origin !== 'https://script.google.com' || url.username || url.password) return null;
    const standard = /^\/macros\/(?:u\/\d+\/)?s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname);
    // Workspace URLs use both /a/macros/{domain}/s/... and /a/{domain}/macros/s/....
    const workspacePath = /^\/a\/(?:macros\/([^/]+)|([^/]+)\/macros)\/s\/[A-Za-z0-9_-]+\/exec$/.exec(url.pathname);
    const workspaceDomain = workspacePath?.[1] || workspacePath?.[2] || '';
    const workspace = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(workspaceDomain);
    if (!standard && !workspace) return null;
    for (const key of url.searchParams.keys()) if (key !== 'authuser') return null;
    if (url.hash && !/^#(?:links|inbox-and-tasks|settings(?:\/(?:appearance|sources|calendar|extension))?)$/.test(url.hash)) return null;
    return url.href;
  } catch { return null; }
}
export function embeddedPortalUrl(url: string, nonce: string): string {
  const normalized = normalizePortalUrl(url);
  if (!normalized || !/^[a-f0-9]{32}$/.test(nonce)) throw new Error('Invalid side panel connection');
  const result = new URL(normalized);
  result.searchParams.set('sidePanel', '1');
  result.searchParams.set('panelNonce', nonce);
  return result.href;
}
export function isPortalOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.origin === origin && url.protocol === 'https:' && !url.port && (url.hostname === 'script.google.com' ||
      url.hostname === 'script.googleusercontent.com' || url.hostname.endsWith('-script.googleusercontent.com'));
  } catch { return false; }
}
export function isReadyMessage(origin: string, data: unknown, nonce: string): boolean {
  if (!isPortalOrigin(origin) || !data || typeof data !== 'object') return false;
  const value = data as Record<string, unknown>;
  return value.type === READY_MESSAGE && value.nonce === nonce && /^[a-f0-9]{32}$/.test(nonce);
}
export function allowedPanelAncestor(ancestors: readonly string[], extensionIds: readonly string[]): boolean {
  return ancestors.length > 0 && extensionIds.some((id) => /^[a-p]{32}$/.test(id) &&
    ancestors[ancestors.length - 1] === 'chrome-extension://' + id) &&
    ancestors.slice(0, -1).every(isPortalOrigin);
}
