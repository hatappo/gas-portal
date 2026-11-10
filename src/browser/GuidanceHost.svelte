<script lang="ts">
  import SettingsGuidance from './SettingsGuidance.svelte';
  import type { Cell } from './view';
  let { state }: { state: Cell<{ message: string; language: string }> } = $props();
</script>

<SettingsGuidance {...$state} />
