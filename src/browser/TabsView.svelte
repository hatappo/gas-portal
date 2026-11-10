<script lang="ts">
  import { Tabs } from '@skeletonlabs/skeleton-svelte';
  import { language } from './language-store';
  import type { Cell } from './view';
  import type { PortalTab } from './tabs';
  import Existing from './Existing.svelte';
  let {
    tabs,
    selected,
    select,
    listAttributes,
    labels,
  }: {
    tabs: PortalTab[];
    selected: Cell<number>;
    select: (index: number) => void;
    listAttributes: Record<string, string>;
    labels: Node[][];
  } = $props();
  const attributes = (node: HTMLElement) =>
    Object.fromEntries(
      Array.from(node.attributes)
        .filter(
          ({ name }) =>
            ![
              'role',
              'tabindex',
              'aria-selected',
              'aria-controls',
              'hidden',
              'title',
              'data-i18n-title',
            ].includes(name),
        )
        .map(({ name, value }) => [name, value]),
    );
</script>

<Tabs
  style="display: contents"
  value={tabs[$selected].hash}
  onValueChange={({ value }) => select(tabs.findIndex((tab) => tab.hash === value))}
  ids={{
    trigger: (value) => tabs.find((tab) => tab.hash === value)!.button.id,
    content: (value) => tabs.find((tab) => tab.hash === value)!.panel.id,
  }}
>
  <Tabs.List {...listAttributes}>
    {#each tabs as tab, index (tab.hash)}
      <Tabs.Trigger
        {...attributes(tab.button)}
        value={tab.hash}
        aria-controls={tab.panel.id}
        onclick={() => select(index)}
        title={tab.button.id === 'tab-settings' ? PortalI18n.t('Settings', $language) : undefined}
      >
        <Existing nodes={labels[index]} />
      </Tabs.Trigger>
    {/each}
    <Tabs.Indicator />
  </Tabs.List>
  {#each tabs as tab (tab.hash)}<Existing nodes={[tab.panel]} />{/each}
</Tabs>
