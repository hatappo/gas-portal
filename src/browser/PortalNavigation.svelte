<script lang="ts">
  import { Tabs } from '@skeletonlabs/skeleton-svelte';
  import { onMount, untrack } from 'svelte';
  import { language } from './language-store';
  import type { Cell } from './view';
  import type { PortalTab } from './tabs';
  import Existing from './Existing.svelte';
  import Icon from './Icon.svelte';
  let { tabs, selected, select, pinned }: {
    tabs: PortalTab[]; selected: Cell<number>; select: (index: number) => void; pinned: Cell<boolean>;
  } = $props();
  const icons = untrack(() => tabs.map(tab => tab.button.querySelector('svg')!.cloneNode(true)));
  const labels = ['Links', 'Inbox & Tasks', 'Calendar', 'Settings'];
  const t = (key: string) => PortalI18n.t(key, $language);
  onMount(() => {
    const layout = window.matchMedia?.('(max-width: 760px)');
    const sync = () => { document.documentElement.dataset.compact = String(layout?.matches ?? false); };
    sync();
    layout?.addEventListener('change', sync);
    return () => layout?.removeEventListener('change', sync);
  });
</script>

<Tabs style="display: contents" value={tabs[$selected].hash}
  ids={{ root: 'portal-tabs-root', list: 'portal-navigation', trigger: value => tabs.find(tab => tab.hash === value)!.button.id,
    content: value => tabs.find(tab => tab.hash === value)!.panel.id }}
  onValueChange={({ value }) => { const index = tabs.findIndex(tab => tab.hash === value); if (index >= 0) select(index); }}>
  <Tabs.List id="portal-navigation" class="portal-tabs header-tabs" aria-label={t('Portal sections')}>
    {#each tabs as tab, index (tab.hash)}
      <Tabs.Trigger class="tab header-tab" value={tab.hash} aria-controls={tab.panel.id}
        aria-label={t(labels[index])} title={tab.hash === 'calendar' && $pinned ? t('Calendar · pinned') : t(labels[index])}
        onclick={() => select(index)}>
        <Existing nodes={[icons[index]]} />
        <span class="header-tab-label">{t(labels[index])}</span>
        {#if tab.hash === 'calendar' && $pinned}<span class="calendar-pinned-mark" aria-hidden="true"><Icon id="calendar-pin-icon" /></span>{/if}
      </Tabs.Trigger>
    {/each}
  </Tabs.List>
</Tabs>
