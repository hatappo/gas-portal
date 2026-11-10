import { createCell, mountView } from './view';
import Catalog from './CatalogView.svelte';
export interface CatalogView {
  disabled: boolean;
  notices: { label: string; message: string }[];
  tools: CatalogTool[];
  tags: string[];
  selected: Set<string>;
  issues: CatalogWarning[];
  view: 'cards' | 'list';
  language: string;
  unblocked: string[];
}
export function mountCatalogView(
  selectTags: (tags: string[]) => void,
  selectView: (view: 'cards' | 'list') => void,
) {
  const [state, setState] = createCell<CatalogView>({
    notices: [],
    disabled: true,
    tools: [],
    tags: [],
    selected: new Set(),
    issues: [],
    view: 'cards',
    language: 'en',
    unblocked: [],
  });
  const hosts: Record<string, Element> = {
    cards: document.getElementById('tools')!,
    list: document.getElementById('tool-rows')!,
    tags: document.getElementById('tags')!,
    view: document.querySelector('.view-switch')!,
    issues: document.getElementById('warning-list')!,
    notices: document.getElementById('links-notices')!,
  };
  // Keep trusted icon templates outside the view-switch mount target.
  document
    .querySelectorAll('.view-switch template')
    .forEach((template) => document.body.append(template));
  for (const [part, host] of Object.entries(hosts)) {
    host.replaceChildren();
    mountView(Catalog, host, { state, part, selectTags, selectView });
  }
  return setState;
}
