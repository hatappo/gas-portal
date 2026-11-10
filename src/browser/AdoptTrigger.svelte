<script lang="ts">
  import { onMount } from 'svelte';
  let {
    node,
    attributes,
    description,
  }: { node: HTMLElement; attributes: Record<string, unknown>; description?: string | null } =
    $props();
  let host = $state<HTMLSpanElement>(null!);
  onMount(() => {
    host.append(node);
  });
  $effect(() => {
    const listeners: [string, EventListener][] = [];
    for (const [key, value] of Object.entries(attributes)) {
      if (key.startsWith('on') && typeof value === 'function') {
        const type = key.slice(2).toLowerCase();
        node.addEventListener(type, value as EventListener);
        listeners.push([type, value as EventListener]);
      } else if (typeof value !== 'function' && key !== 'children') {
        const text =
          key === 'aria-describedby' ? [description, value].filter(Boolean).join(' ') : value;
        if (text === undefined || text === null || text === false) node.removeAttribute(key);
        else node.setAttribute(key, String(text));
      }
    }
    if (!attributes['aria-describedby']) {
      if (description) node.setAttribute('aria-describedby', description);
      else node.removeAttribute('aria-describedby');
    }
    return () => listeners.forEach(([type, listener]) => node.removeEventListener(type, listener));
  });
</script>

<span bind:this={host} style="display: contents"></span>
