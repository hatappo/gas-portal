import { allowedPanelAncestor, READY_MESSAGE } from './side-panel-protocol';
let parentOrigin: string | undefined;
/** Reject unauthorized embedding before mounting controls or starting any RPCs. */
export function allowSidePanel(): boolean {
  parentOrigin = undefined;
  const ids = document.querySelector<HTMLMetaElement>('meta[name="portal-extensions"]')?.content;
  if (ids === undefined) return true;
  const ancestors = Array.from(location.ancestorOrigins || []);
  if (!allowedPanelAncestor(ancestors, ids.split(','))) {
    document.body.replaceChildren(document.createTextNode(PortalI18n.t('Open this portal in its configured extension or in a browser tab.', document.documentElement.lang)));
    document.getElementById('side-panel-guard')?.remove();
    return false;
  }
  parentOrigin = ancestors[ancestors.length - 1];
  document.getElementById('side-panel-guard')?.remove();
  return true;
}
export function notifySidePanelReady() {
  const nonce = document.querySelector<HTMLMetaElement>('meta[name="portal-panel-nonce"]')?.content;
  if (parentOrigin && nonce && /^[a-f0-9]{32}$/.test(nonce)) {
    window.top?.postMessage({ type: READY_MESSAGE, nonce }, parentOrigin);
  }
}
