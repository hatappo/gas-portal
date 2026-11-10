<script lang="ts">
  // Only trusted SVG templates embedded by the build are rendered as markup.
  // URLs, messages, and other service data never enter this component.
  let { id }: { id: string } = $props();
  let markup = $derived(
    (document.getElementById(id) as HTMLTemplateElement | null)?.innerHTML || '',
  );
</script>

{@html markup}
