import { createCell, mountView } from './view';
import Actions from './ActionView.svelte';
import ActionSearch from './ActionSearch.svelte';
import type { ActionFilters } from './action-search';
export interface ActionView {
  diagnostics: ActionDiagnostic[];
  inboxes: InboxGroup[];
  items: ActionItem[];
  notices: { label: string; notice: ActionNotice }[];
  moreSources: string[];
  pending: boolean;
  hasResults: boolean;
  connected: boolean;
  language: string;
}
export function mountActionView() {
  const [state, setState] = createCell<ActionView>({
    diagnostics: [],
    inboxes: [],
    items: [],
    notices: [],
    moreSources: [],
    pending: true,
    hasResults: false,
    connected: false,
    language: 'en',
  });
  const [filters, setFilters] = createCell<ActionFilters>({ text: '', types: [] });
  const searchHost = document.getElementById('actions-search-host')!;
  searchHost.replaceChildren();
  mountView(ActionSearch, searchHost, { filters, update: setFilters });
  const clearFilters = () => {
    setFilters({ text: '', types: [] });
    document.getElementById('actions-search')?.focus();
  };
  const hosts = {
    inbox: 'inbox-services',
    inboxCount: 'inbox-total-count',
    count: 'actions-count',
    status: 'actions-status',
    items: 'action-items',
    diagnostics: 'action-diagnostics',
  };
  for (const [part, id] of Object.entries(hosts)) {
    const host = document.getElementById(id)!;
    host.replaceChildren();
    mountView(Actions, host, { state, filters, clearFilters, part });
  }
  state.subscribe((value) => {
    document
      .getElementById('actions-count')!
      .style.setProperty('--count-digits', String(String(value.items.length).length));
    document
      .getElementById('inbox-total-count')!
      .style.setProperty(
        '--count-digits',
        String(String(value.inboxes.flatMap((group) => group.items).length).length),
      );
  });
  return setState;
}
