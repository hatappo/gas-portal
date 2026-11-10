import { mountView, type Cell } from './view';
import type { PortalTab } from './tabs';
import CompactNavigation from './CompactNavigation.svelte';
export function mountCompactNavigation(
  tabs: PortalTab[],
  selected: Cell<number>,
  select: (index: number) => void,
) {
  mountView(CompactNavigation, document.getElementById('compact-navigation')!, {
    tabs,
    selected,
    select,
  });
}
