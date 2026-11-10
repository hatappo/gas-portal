<script lang="ts">
  import ToolLink from './ToolLink.svelte';
  import Favicon from './Favicon.svelte';
  import BlockedUrl from './BlockedUrl.svelte';
  import RelatedLinks from './RelatedLinks.svelte';
  import ToolTags from './ToolTags.svelte';
  let {
    tool,
    tagColor,
    language,
    unblocked,
    row = false,
  }: {
    tool: CatalogTool;
    tagColor: (tag: string) => string | undefined;
    language: string;
    unblocked: string[];
    row?: boolean;
  } = $props();
  let blocked = $derived(PortalUrlSchemes.isBlocked(tool.url, unblocked));
  let saved = $derived(tool.id.startsWith('slack-saved:'));
</script>

{#snippet heading()}<Favicon
    slack={saved}
    url={tool.url}
    icon={tool.icon}
    class="tool-favicon"
    size={20}
  />
  <span>{tool.name}</span>{/snippet}
{#if row}
  <tr class:is-saved-links={saved}>
    <th scope="row">
      <ToolLink url={tool.url} {language} {unblocked} class="tool-name-link">
        {@render heading()}
      </ToolLink>{#if blocked}<BlockedUrl url={tool.url} {language} />{/if}
    </th>
    <td>{tool.description || '—'}</td>
    <td><ToolTags {tool} {tagColor} /></td>
    <td>
      {#if tool.children?.length}<RelatedLinks
          {tool}
          {language}
          {unblocked}
          tooltipLeft
        />{:else}—{/if}
    </td>
  </tr>
{:else}
  <li>
    <article
      class="tool-card card card-border portal-surface"
      class:is-blocked={blocked}
      class:is-saved-links={saved}
    >
      <ToolLink url={tool.url} {language} {unblocked} class="tool-main">
        <h3>{@render heading()}</h3>
        <p class="tool-description">{tool.description}</p>
        {#if blocked}<BlockedUrl url={tool.url} {language} />{/if}<ToolTags {tool} {tagColor} />
      </ToolLink>
      {#if tool.children?.length}<RelatedLinks {tool} {language} {unblocked} />{/if}
    </article>
  </li>
{/if}
