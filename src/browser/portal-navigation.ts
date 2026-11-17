import { mountView, type Cell } from './view';
import type { PortalTab } from './tabs';
import PortalNavigation from './PortalNavigation.svelte';

export interface CalendarPlacement {
  visible: Cell<boolean>;
  pinned: Cell<boolean>;
  pin(value: boolean): void;
}

export function mountPortalNavigation(tabs: PortalTab[], selected: Cell<number>, select: (index: number) => void, pinned: Cell<boolean>) {
  const list = tabs[0].button.parentElement!;
  const host = document.createElement('div');
  host.className = 'header-navigation';
  list.replaceWith(host);
  mountView(PortalNavigation, host, { tabs, selected, select, pinned });
  tabs.forEach(tab => { tab.button = document.getElementById(tab.button.id)!; });
}
