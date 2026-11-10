<script lang="ts">
  import { Collapsible } from '@skeletonlabs/skeleton-svelte';
  import { onMount, type Snippet } from 'svelte';
  let {
    title,
    children,
    class: className = '',
    autoOpen = false,
  }: { title: Snippet; children: Snippet; class?: string; autoOpen?: boolean } = $props();
  let open = $state(false);
  let host = $state<HTMLDivElement>(null!);
  $effect(() => {
    open = autoOpen;
  });
  onMount(() => {
    const reveal = () => {
      open = true;
    };
    host.addEventListener('portal:disclosure-open', reveal);
    return () => host.removeEventListener('portal:disclosure-open', reveal);
  });
</script>

<div bind:this={host} style="display: contents">
  <Collapsible
    {open}
    onOpenChange={(event) => (open = event.open)}
    class={'portal-disclosure ' + className}
    data-portal-disclosure=""
  >
    <Collapsible.Trigger class="disclosure-trigger">
      <span class="disclosure-chevron" aria-hidden="true"></span>
      <span>{@render title()}</span>
    </Collapsible.Trigger>
    <Collapsible.Content
      class="portal-disclosure-content"
      hidden={false}
      inert={open ? undefined : true}
      data-state={open ? 'open' : 'closed'}
      aria-hidden={!open}
    >
      <div class="disclosure-body">
        <div class="disclosure-inner"><div class="disclosure-copy">{@render children()}</div></div>
      </div>
    </Collapsible.Content>
  </Collapsible>
</div>
