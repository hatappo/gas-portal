<script lang="ts">
  let { tool, tagColor }: { tool: CatalogTool; tagColor: (tag: string) => string | undefined } =
    $props();
</script>

<div class="tool-tags" hidden={!tool.tags.length}>
  {#each tool.tags as tag}<span class="tool-tag badge" style:--tag-accent={tagColor(tag)}>
      {tag}
    </span>{/each}
</div>
