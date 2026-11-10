import { createCell, mountView } from './view';
import Actions from './ActionView.svelte';
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
  const search = document.getElementById('actions-search') as HTMLInputElement;
  const [query, setQuery] = createCell('');
  search.addEventListener('input', () =>
    setQuery(search.value.normalize('NFKC').toLocaleLowerCase('ja').trim()),
  );
  const clearFilters = () => {
    search.value = '';
    setQuery('');
    search.focus();
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
    mountView(Actions, host, { state, query, clearFilters, part });
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
