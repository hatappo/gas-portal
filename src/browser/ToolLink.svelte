<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  let {
    url,
    description,
    language,
    unblocked,
    children,
    class: className = '',
    ...attributes
  }: HTMLAttributes<HTMLElement> & {
    url: string;
    description?: string;
    language: string;
    unblocked: string[];
    children: Snippet;
  } = $props();
  let blocked = $derived(PortalUrlSchemes.isBlocked(url, unblocked));
</script>

{#if blocked}<span
    {...attributes}
    class={className + ' is-blocked'}
    aria-disabled="true"
    {...{ 'aria-description': description || undefined }}
    title={PortalI18n.t('Blocked link: {url}', language, { url })}
  >
    {@render children()}
  </span>
{:else}<a
    {...attributes}
    class={className}
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    {...{ 'aria-description': description || undefined }}
  >
    {@render children()}
    <span class="visually-hidden">{PortalI18n.t('(opens in a new tab)', language)}</span>
  </a>{/if}
