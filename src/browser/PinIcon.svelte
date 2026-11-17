<script lang="ts">
  import Icon from './Icon.svelte';
  let { pinned }: { pinned: boolean } = $props();
</script>

<span class="pin-state-icon" aria-hidden="true">
  <span class="pin-current"><Icon id={pinned ? 'calendar-pin-icon' : 'calendar-pin-off-icon'} /></span>
  <span class="pin-next"><Icon id={pinned ? 'calendar-pin-off-icon' : 'calendar-pin-icon'} /></span>
</span>
