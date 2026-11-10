<script lang="ts">
  // Adopt server-rendered form nodes without losing controller listeners or drafts.
  let { nodes }: { nodes: Node[] } = $props();
  let host = $state<HTMLSpanElement>(null!);
  $effect(() => {
    host.replaceChildren(...nodes);
  });
</script>

<span bind:this={host} style="display: contents"></span>
