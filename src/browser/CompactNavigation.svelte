<script lang="ts">
  import { SegmentedControl } from '@skeletonlabs/skeleton-svelte';
  import { onMount } from 'svelte';
  import { language } from './language-store';
  import type { Cell } from './view';
  import type { PortalTab } from './tabs';
  import Existing from './Existing.svelte';
  let {
    tabs,
    selected,
    select,
  }: { tabs: PortalTab[]; selected: Cell<number>; select: (index: number) => void } = $props();
  const icons = $derived(tabs.map((tab) => tab.button.querySelector('svg')!.cloneNode(true)));
  const labels = ['Links', 'Inbox & Tasks', 'Settings'];
  const label = (index: number) => PortalI18n.t(labels[index], $language);
  const tabId = (value: string) => tabs.find(tab => tab.hash === value)!.button.id.replace('tab-', '');
  onMount(() => {
    const layout = typeof matchMedia === 'undefined' ? undefined : matchMedia('(max-width: 760px)');
    let focusFrame = 0;
    let displacedFocus = false;
    const isNavigation = (node: EventTarget | null) => node instanceof Node &&
      (tabs.some(tab => tab.button === node) || !!document.getElementById('compact-navigation')?.contains(node));
    const rememberDisplacedFocus = (event: FocusEvent) => {
      // CSS can hide the wide tab before the media-query callback runs.
      if (String(layout?.matches ?? false) !== document.documentElement.dataset.compact && isNavigation(event.target)) {
        displacedFocus = true;
      }
    };
    document.addEventListener('focusout', rememberDisplacedFocus, true);
    const sync = () => {
      const compact = layout?.matches ?? false;
      if (document.documentElement.dataset.compact === String(compact)) return;
      const active = document.activeElement;
      document.documentElement.dataset.compact = String(compact);
      cancelAnimationFrame(focusFrame);
      const moveFocus = displacedFocus || isNavigation(active);
      displacedFocus = false;
      if (moveFocus) {
        // Wait for the new layout and radio-group bindings before focusing a newly visible control.
        focusFrame = requestAnimationFrame(() => {
          const target = compact
            ? document.getElementById('compact-tab-' + tabId(tabs[selected()].hash))
            : tabs[selected()].button;
          target?.focus({ preventScroll: true });
        });
      }
    };
    sync();
    layout?.addEventListener('change', sync);
    return () => {
      cancelAnimationFrame(focusFrame);
      layout?.removeEventListener('change', sync);
      document.removeEventListener('focusout', rememberDisplacedFocus, true);
    };
  });
</script>

<SegmentedControl
  class="compact-nav segmented-control"
  name="portal-section"
  orientation="horizontal"
  aria-label={PortalI18n.t('Portal sections', $language)}
  value={tabs[$selected].hash}
  ids={{ itemHiddenInput: value => 'compact-tab-' + tabId(value), item: value => 'compact-nav-' + tabId(value) }}
  onValueChange={({ value }) => {
    const index = tabs.findIndex(tab => tab.hash === value);
    if (index >= 0) select(index);
  }}
>
  <SegmentedControl.Control>
    <SegmentedControl.Indicator />
    {#each tabs as tab, index (tab.hash)}
      <SegmentedControl.Item class="compact-nav-item" value={tab.hash} title={label(index)} data-portal-tab={tab.button.id.replace('tab-', '')}>
        <SegmentedControl.ItemHiddenInput aria-label={label(index)} aria-controls={tab.panel.id} />
        <SegmentedControl.ItemText>
          <Existing nodes={[icons[index]]} />
          <span class="sr-only">{label(index)}</span>
        </SegmentedControl.ItemText>
      </SegmentedControl.Item>
    {/each}
  </SegmentedControl.Control>
</SegmentedControl>
