<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  let {
    url,
    class: className = '',
    children,
  }: { url: string; class?: string; children: Snippet } = $props();
  let href = $derived.by(() => {
    try {
      const value = new URL(url);
      if (value.protocol === 'https:' && !value.username && !value.password) return value.href;
    } catch {
      /* Invalid destinations stay inert. */
    }
    return undefined;
  });
</script>

<a
  {href}
  target={href ? '_blank' : undefined}
  rel={href ? 'noopener noreferrer' : undefined}
  class={className}
>
  {@render children()}<Icon id="action-external-icon" />
</a>
