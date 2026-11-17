<script lang="ts">
  import CalendarPanel from './CalendarPanel.svelte';
  import CalendarSettingsForm from './CalendarSettingsForm.svelte';
  import type { Cell } from './view';
  import type { CalendarViewState, CalendarCommands } from './calendar-types';
  let {
    model,
    draft,
    setDraft,
    commands,
    part,
  }: {
    model: Cell<CalendarViewState>;
    draft: Cell<CalendarSettings>;
    setDraft: (value: CalendarSettings) => void;
    commands: CalendarCommands;
    part: 'panel' | 'settings';
  } = $props();
</script>

{#if part === 'panel'}<CalendarPanel
    state={$model}
    {commands}
  />{:else}<CalendarSettingsForm state={$model} draft={$draft} change={setDraft} {commands} />{/if}
