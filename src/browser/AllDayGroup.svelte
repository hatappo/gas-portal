<script lang="ts">
  import { onDestroy } from 'svelte';
  import Icon from './Icon.svelte';
  let {
    events,
    language,
    browsing,
    expandAll,
  }: { events: CalendarEvent[]; language: string; browsing: boolean; expandAll: boolean } =
    $props();
  let pinned = $state(false),
    inspected = $state(false),
    hovered = $state(false),
    focused = $state(false),
    collapsed = $state(false);
  let expanded = $derived(
    expandAll || pinned || (!collapsed && (hovered || focused || (browsing && inspected))),
  );
  $effect(() => {
    if (!browsing) inspected = false;
  });
  let hoverTimer: ReturnType<typeof setTimeout>;
  let card = $state<HTMLDivElement>(null!);
  onDestroy(() => clearTimeout(hoverTimer));
  const toggle = () => {
    clearTimeout(hoverTimer);
    const wasPinned = pinned;
    pinned = !wasPinned;
    if (wasPinned) {
      card.querySelector<HTMLButtonElement>('.calendar-all-day-trigger')?.focus();
      focused = false;
    }
    collapsed = wasPinned;
  };
  const t = (key: string) => PortalI18n.t(key, language);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={card}
  class="calendar-all-day"
  data-expanded={expanded}
  onpointerenter={(event) => {
    if (event.pointerType !== 'touch') {
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => {
        hovered = true;
        inspected = true;
        collapsed = false;
      }, 150);
    }
  }}
  onpointerleave={() => {
    clearTimeout(hoverTimer);
    hovered = false;
  }}
  onfocusin={(event) => {
    if (!card.contains(event.relatedTarget as Node)) {
      clearTimeout(hoverTimer);
      focused = true;
      collapsed = false;
    }
  }}
  onfocusout={(event) => {
    if (!card.contains(event.relatedTarget as Node)) focused = false;
  }}
>
  <div class="calendar-all-day-heading">
    <button
      type="button"
      class="calendar-all-day-trigger"
      disabled={expandAll}
      aria-expanded={expanded}
      aria-controls="calendar-all-day-content"
      onclick={toggle}
    >
      <span lang="en">All-day events</span>
      · {events.length}
    </button>
    <button
      type="button"
      class="calendar-all-day-pin"
      hidden={!expanded || expandAll}
      aria-pressed={pinned}
      aria-label={t('Keep all-day events expanded')}
      title={t(pinned ? 'Collapse all-day events' : 'Keep all-day events expanded')}
      onclick={toggle}
    >
      <Icon id={pinned ? 'calendar-pin-off-icon' : 'calendar-pin-icon'} />
    </button>
  </div>
  <div
    id="calendar-all-day-content"
    class="calendar-all-day-body"
    aria-hidden={!expanded}
    inert={!expanded}
  >
    <div>
      {#each events as event (event.id)}<a
          class="calendar-all-day-item link link-hover"
          href={event.url || undefined}
          target={event.url ? '_blank' : undefined}
          rel="noopener noreferrer"
          tabindex={expanded ? undefined : -1}
          style:--event-color={event.color}
          title={event.title || t('Busy')}
        >
          {event.title || t('Busy')}
        </a>{/each}
    </div>
  </div>
</div>
