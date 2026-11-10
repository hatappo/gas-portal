<script lang="ts">
  import { Menu } from '@skeletonlabs/skeleton-svelte';
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
  let open = $state(false);
  $effect(() => {
    closeForTab($selected);
  });
  function closeForTab(_index: number) {
    open = false;
  }
  onMount(() => {
    const close = () => {
      open = false;
    };
    const layout = typeof matchMedia === 'undefined' ? undefined : matchMedia('(max-width: 760px)');
    const sync = () => {
      const compact = layout?.matches ?? false;
      if (document.documentElement.dataset.compact === String(compact)) return;
      const active = document.activeElement;
      document.documentElement.dataset.compact = String(compact);
      close();
      if (compact && tabs.some((tab) => tab.button === active))
        document.getElementById('compact-nav-trigger')?.focus({ preventScroll: true });
      else if (
        !compact &&
        (document.getElementById('compact-navigation')?.contains(active) ||
          active?.closest('.compact-nav-menu'))
      ) {
        requestAnimationFrame(() => tabs[selected()].button.focus({ preventScroll: true }));
      }
    };
    sync();
    layout?.addEventListener('change', sync);
    document.addEventListener('portal:tabchange', close);
    return () => {
      layout?.removeEventListener('change', sync);
      document.removeEventListener('portal:tabchange', close);
    };
  });
</script>

<Menu
  {open}
  onOpenChange={(event) => (open = event.open)}
  ids={{ trigger: 'compact-nav-trigger' }}
  positioning={{ placement: 'bottom-end', gutter: 8 }}
>
  <Menu.Trigger
    class="btn button-quiet button-square"
    aria-label={PortalI18n.t('Switch section: {section}', $language, { section: label($selected) })}
    title={label($selected)}
  >
    <Existing nodes={[icons[$selected]]} />
  </Menu.Trigger>
  <Menu.Positioner>
    <Menu.Content class="compact-nav-menu">
      <Menu.ItemGroup aria-label={PortalI18n.t('Portal sections', $language)}>
        {#each tabs as tab, index (tab.hash)}<Menu.OptionItem
            type="radio"
            checked={$selected === index}
            onCheckedChange={() => select(index)}
            class="compact-nav-item"
            value={tab.hash}
            valueText={label(index)}
            onclick={() => select(index)}
            aria-current={$selected === index ? 'page' : undefined}
            data-portal-tab={tab.button.id.replace('tab-', '')}
          >
            <Existing nodes={[icons[index].cloneNode(true)]} />
            <span>{label(index)}</span>
            {#if $selected === index}<span class="compact-nav-selected" aria-hidden="true">
                ✓
              </span>{/if}
          </Menu.OptionItem>{/each}
      </Menu.ItemGroup>
    </Menu.Content>
  </Menu.Positioner>
</Menu>
