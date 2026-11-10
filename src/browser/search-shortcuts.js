// Keep search focus local to the visible tab, without changing its query or filters.
/** @param {Document} [root] @param {string} [platform] */
export function initializeSearchShortcuts(root = document, platform = navigator.platform) {
  const mac = /Mac|iPhone|iPad|iPod/.test(platform);
  const searches = [...root.querySelectorAll('input')].filter(input => input.id === 'search' || input.id === 'actions-search');
  for (const input of searches) {
    input.setAttribute('aria-keyshortcuts', mac ? 'Meta+K' : 'Control+K');
    const hint = input.parentElement?.querySelector('[data-search-shortcut]');
    if (hint) hint.textContent = mac ? '⌘K' : 'Ctrl K';
  }
  /** @param {KeyboardEvent} event */
  function focusSearch(event) {
    if (event.defaultPrevented || event.isComposing || event.repeat || event.altKey || event.shiftKey ||
        event.key.toLowerCase() !== 'k' || !(mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)) return;
    const input = searches.find(node => node.isConnected && !node.matches(':disabled') && !node.closest('[hidden], [inert]'));
    if (!input) return;
    input.focus();
    if (root.activeElement === input) event.preventDefault();
  }
  root.addEventListener('keydown', focusSearch);
  return () => root.removeEventListener('keydown', focusSearch);
}
