<script lang="ts">
  import { Tooltip } from '@skeletonlabs/skeleton-svelte';
  import { onMount, type Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  let {
    text,
    placement = 'top',
    triggerId,
    children,
  }: {
    text: string;
    triggerId?: string;
    placement?: 'top' | 'left' | 'bottom-end';
    children: Snippet<[HTMLAttributes<HTMLElement>]>;
  } = $props();
  let open = $state(false);
  const id = $props.id();
  const contentId = id + '-hint';
  onMount(() => {
    const close = () => {
      open = false;
    };
    document.addEventListener('portal:tabchange', close);
    return () => document.removeEventListener('portal:tabchange', close);
  });
</script>

<Tooltip
  ids={{ trigger: triggerId, content: contentId }}
  open={open && !!text}
  onOpenChange={(event) => (open = event.open)}
  openDelay={350}
  closeDelay={100}
  positioning={{ placement, gutter: 8, overflowPadding: 12 }}
>
  <Tooltip.Trigger
    onkeydown={(event) => {
      if (event.key === 'Escape') open = false;
    }}
    onfocusin={() => (open = true)}
    onfocusout={() => (open = false)}
  >
    {#snippet element(attributes)}{@render children({
        ...attributes,
        'aria-describedby': open && text ? contentId : undefined,
      } as unknown as HTMLAttributes<HTMLElement>)}{/snippet}
  </Tooltip.Trigger>
  {#if open && text}<Tooltip.Positioner>
      <Tooltip.Content class="portal-tooltip">{text}</Tooltip.Content>
    </Tooltip.Positioner>{/if}
</Tooltip>
