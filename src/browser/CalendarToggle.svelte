<script lang="ts">
  import { Tooltip } from '@skeletonlabs/skeleton-svelte';
  import { onMount } from 'svelte';
  import { language } from './language-store';
  import Icon from './Icon.svelte';
  let { open, toggle }: { open: boolean; toggle: (open: boolean) => void } = $props();
  let compact = $state(false),
    settings = $state(false),
    hintOpen = $state(false);
  let suppressed = $derived(compact && settings);
  const t = (key: string) => PortalI18n.t(key, $language);
  $effect(() => {
    resetHint(suppressed, open);
  });
  function resetHint(_suppressed: boolean, _open: boolean) {
    hintOpen = false;
  }
  onMount(() => {
    const media = typeof matchMedia === 'undefined' ? undefined : matchMedia('(max-width: 760px)');
    const resize = () => (compact = media?.matches ?? false);
    const navigate = () => {
      settings = document.getElementById('settings-panel')?.hidden === false;
      hintOpen = false;
    };
    resize();
    navigate();
    media?.addEventListener('change', resize);
    document.addEventListener('portal:tabchange', navigate);
    return () => {
      media?.removeEventListener('change', resize);
      document.removeEventListener('portal:tabchange', navigate);
    };
  });
</script>

<Tooltip
  open={hintOpen}
  onOpenChange={(event) => (hintOpen = event.open)}
  openDelay={350}
  closeDelay={100}
  closeOnClick={false}
  positioning={{ placement: 'bottom-end', gutter: 8, overflowPadding: 12 }}
>
  <Tooltip.Trigger
    id="toggle-calendar"
    type="button"
    class="btn button-quiet button-square"
    aria-label={t('Today’s schedule')}
    aria-expanded={open && !suppressed}
    aria-controls="calendar-panel"
    aria-disabled={suppressed || undefined}
    onclick={() => {
      if (suppressed) hintOpen = true;
      else {
        hintOpen = false;
        toggle(!open);
      }
    }}
  >
    <Icon id={suppressed && open ? 'calendar-off-icon' : 'calendar-icon'} />
  </Tooltip.Trigger>
  {#if hintOpen}<Tooltip.Positioner>
      <Tooltip.Content class="portal-tooltip">
        {suppressed
          ? t('In compact view, the calendar is hidden while Settings is open.')
          : t('Today’s schedule')}
      </Tooltip.Content>
    </Tooltip.Positioner>{/if}
</Tooltip>
