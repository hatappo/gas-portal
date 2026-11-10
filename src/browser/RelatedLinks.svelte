<script lang="ts">
  import ToolLink from './ToolLink.svelte';
  import Favicon from './Favicon.svelte';
  import BlockedUrl from './BlockedUrl.svelte';
  import Hint from './Hint.svelte';
  let {
    tool,
    language,
    unblocked,
    tooltipLeft = false,
  }: { tool: CatalogTool; language: string; unblocked: string[]; tooltipLeft?: boolean } = $props();
</script>

<ul
  class="related-links"
  aria-label={PortalI18n.t('Related links for {name}', language, { name: tool.name })}
>
  {#each tool.children || [] as child, index (child.url + ':' + index)}<li>
      <Hint text={child.description || ''} placement={tooltipLeft ? 'left' : 'top'}>
        {#snippet children(attributes)}<ToolLink
            {...attributes}
            url={child.url}
            {language}
            {unblocked}
            description={child.description}
          >
            {#if !PortalUrlSchemes.isBlocked(child.url, unblocked)}<Favicon
                slack={tool.id.startsWith('slack-saved:')}
                url={child.url}
                icon={child.icon}
                class="related-favicon"
                size={14}
              />{/if}
            <span class="related-label">{child.name}</span>
            {#if PortalUrlSchemes.isBlocked(child.url, unblocked)}<BlockedUrl
                url={child.url}
                {language}
              />{/if}
          </ToolLink>{/snippet}
      </Hint>
    </li>{/each}
</ul>
