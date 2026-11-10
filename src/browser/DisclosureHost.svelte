<script lang="ts">
  import Disclosure from './Disclosure.svelte';
  import Existing from './Existing.svelte';
  let {
    title: titleNode,
    nodes,
    className,
  }: { title: HTMLElement; nodes: Node[]; className: string } = $props();
</script>

<Disclosure class={className}>
  {#snippet title()}<Existing nodes={[titleNode]} />{/snippet}
  <Existing {nodes} />
</Disclosure>
