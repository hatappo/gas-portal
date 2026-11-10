import { mountView } from './view';
import RefreshHint from './RefreshHint.svelte';
export function mountRefreshHints() {
  for (const id of ['refresh-catalog', 'refresh-actions']) {
    const button = document.getElementById(id)!;
    const text = button.getAttribute('data-i18n-title') || 'Fetch latest';
    const description = button.getAttribute('aria-describedby');
    button.removeAttribute('title');
    button.removeAttribute('data-i18n-title');
    const host = document.createElement('span');
    host.style.display = 'contents';
    button.replaceWith(host);
    mountView(RefreshHint, host, { button, text, description });
  }
}
