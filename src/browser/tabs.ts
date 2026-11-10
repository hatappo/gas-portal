import { mountView, type Cell } from './view';
import TabsView from './TabsView.svelte';
export interface PortalTab {
  hash: string;
  button: HTMLElement;
  panel: HTMLElement;
}
export function mountTabs(
  tabs: PortalTab[],
  selected: Cell<number>,
  select: (index: number) => void,
) {
  const list = tabs[0].button.parentElement!;
  const host = document.createElement('div');
  host.className = 'tab-host';
  host.style.display = 'contents';
  list.replaceWith(host);
  const labels = tabs.map(({ button }) => Array.from(button.childNodes));
  const listAttributes = Object.fromEntries(
    Array.from(list.attributes).map(({ name, value }) => [name, value]),
  );
  mountView(TabsView, host, { tabs, selected, select, listAttributes, labels });
  tabs.forEach((tab) => {
    tab.button = document.getElementById(tab.button.id)!;
  });
  selected.subscribe((index) =>
    tabs.forEach((tab, i) => {
      tab.panel.hidden = i !== index;
      tab.panel.setAttribute('role', 'tabpanel');
      tab.panel.setAttribute('aria-labelledby', tab.button.id);
    }),
  );
}
