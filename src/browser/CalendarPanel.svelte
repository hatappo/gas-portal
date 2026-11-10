<script lang="ts">
  import { SegmentedControl } from '@skeletonlabs/skeleton-svelte';
  import { onDestroy } from 'svelte';
  import CalendarEvent from './CalendarEvent.svelte';
  import AllDayGroup from './AllDayGroup.svelte';
  import Hint from './Hint.svelte';
  import Icon from './Icon.svelte';
  import SettingsGuidance from './SettingsGuidance.svelte';
  import {
    calendarErrorText,
    type CalendarViewState,
    type CalendarCommands,
  } from './calendar-types';
  let { state: view, commands }: { state: CalendarViewState; commands: CalendarCommands } =
    $props();
  let expanded = $state('');
  let silenced = $state<Set<string>>(new Set());
  let reminderDate: string | undefined;
  const reminderKey = (slot: CalendarSlot) =>
    JSON.stringify([slot.id, slot.event?.start ?? slot.start]);
  $effect(() => {
    const date = view.snapshot?.date;
    if (date && date !== reminderDate) {
      reminderDate = date;
      silenced = new Set();
    }
  });
  let browsingPast = $state(false);
  let inspectedPast = $state<Set<string>>(new Set());
  let inspectionTimer: ReturnType<typeof setTimeout> | undefined;
  let hoverTimer: ReturnType<typeof setTimeout> | undefined;
  let schedule = $state<HTMLDivElement>(null!);
  const cancelInspectionTimer = () => {
    clearTimeout(inspectionTimer);
    inspectionTimer = undefined;
  };
  const finishInspection = () => {
    cancelInspectionTimer();
    browsingPast = false;
    inspectedPast = new Set();
  };
  onDestroy(() => {
    cancelInspectionTimer();
    clearTimeout(hoverTimer);
  });
  const inspectPast = (target: EventTarget | null, immediate = false) => {
    if (!(target instanceof Element)) return;
    const row = target.closest('.calendar-all-day, .calendar-event');
    if (!row) {
      cancelInspectionTimer();
      return;
    }
    if (row.matches('.calendar-all-day, [data-state="past"]')) {
      if (immediate) {
        cancelInspectionTimer();
        browsingPast = true;
      } else if (!browsingPast && inspectionTimer === undefined)
        inspectionTimer = setTimeout(() => {
          inspectionTimer = undefined;
          browsingPast = true;
        }, 150);
    } else finishInspection();
  };
  let filter = $state<'nearby' | 'free' | 'all'>('nearby');
  const filters = [
    { id: 'nearby', label: 'Nearby' },
    { id: 'free', label: 'Free' },
    { id: 'all', label: 'All' },
  ];
  let slots = $derived(
    view.snapshot
      ? PortalCalendar.slots(
          view.snapshot.events,
          view.snapshot.dayStart,
          view.snapshot.dayEnd,
          !view.snapshot.notices.length,
        )
      : [],
  );
  let lastEvent = $derived(
    slots
      .filter((slot) => !slot.gap)
      .reduce<CalendarSlot | undefined>(
        (last, slot) =>
          !last || (slot.event?.end ?? slot.end) >= (last.event?.end ?? last.end) ? slot : last,
        undefined,
      ),
  );
  let allDay = $derived(view.snapshot?.events.filter((event) => event.allDay) || []);
  let zone = $derived(view.snapshot?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const select = (id: string, delay = 150) => {
    clearTimeout(hoverTimer);
    const apply = () => {
      expanded = id;
      if (slots.some((slot) => slot.id === id && slot.end <= view.now))
        inspectedPast = new Set([...inspectedPast, id]);
    };
    if (delay === 0) apply();
    else hoverTimer = setTimeout(apply, delay);
  };
  const t = (key: string, values = {}) => PortalI18n.t(key, view.language, values);
</script>

<div class="calendar-panel-controls">
  <SegmentedControl
    class="calendar-display-filters segmented-control"
    name="calendar-display"
    orientation="horizontal"
    aria-label={t('Schedule display')}
    value={filter}
    onValueChange={({ value }) => {
      if (value === 'nearby' || value === 'free' || value === 'all') {
        clearTimeout(hoverTimer);
        finishInspection();
        expanded = '';
        filter = value;
      }
    }}
  >
    <SegmentedControl.Control>
      <SegmentedControl.Indicator />
      {#each filters as option}<SegmentedControl.Item
          value={option.id}
        >
          <SegmentedControl.ItemHiddenInput aria-label={t(option.label)} />
          <SegmentedControl.ItemText>{t(option.label)}</SegmentedControl.ItemText>
        </SegmentedControl.Item>{/each}
    </SegmentedControl.Control>
  </SegmentedControl>
  <Hint text={t('Fetch latest')}>
    {#snippet children(attributes)}<button
        {...attributes}
        type="button"
        class="refresh-catalog btn button-quiet"
        disabled={view.busy}
        aria-busy={view.busy}
        aria-label={t('Fetch latest')}
        onclick={commands.refresh}
      >
        <Icon id="calendar-refresh-icon" />{#if view.snapshot}<span class="catalog-freshness">
            {t('Retrieved {time}', {
              time: new Intl.DateTimeFormat(view.language, {
                hour: '2-digit',
                minute: '2-digit',
                hourCycle: 'h23',
              }).format(view.snapshot.fetchedAt),
            })}
          </span>{/if}
      </button>{/snippet}
  </Hint>
  <button
    type="button"
    class="calendar-panel-close btn button-quiet button-square btn-sm"
    aria-label={t('Close calendar')}
    onclick={() => commands.toggle(false)}
  >
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  </button>
</div>
{#if view.error}<p class="calendar-notice alert portal-alert-error portal-alert-soft" role="alert">
    <SettingsGuidance message={view.error} language={view.language} />
  </p>{/if}
{#if view.snapshot}
  {#if view.snapshot.notices.length}<p
      class="calendar-notice alert portal-alert-warning portal-alert-soft"
      role="status"
    >
      {t('Some calendars could not be loaded. Free-time blocks are hidden.')}
      <br />
      {#each [...new Set(view.snapshot.notices.map((notice) => calendarErrorText(notice
                .split(': ')
                .pop() || '', view.language)))] as message}<SettingsGuidance
          {message}
          language={view.language}
        />{' '}{/each}
    </p>{/if}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={schedule}
    class="calendar-schedule"
    data-filter={filter}
    data-browsing-past={browsingPast}
    onpointerover={(event) => {
      if (event.pointerType !== 'touch') inspectPast(event.target);
    }}
    onpointerleave={() => {
      if (
        !schedule.contains(document.activeElement) ||
        !document.activeElement?.matches(':focus-visible')
      )
        finishInspection();
    }}
    onfocusin={(event) => inspectPast(event.target, true)}
    onfocusout={(event) => {
      if (!schedule.contains(event.relatedTarget as Node)) finishInspection();
    }}
  >
    {#if allDay.length}<AllDayGroup
        events={allDay}
        language={view.language}
        browsing={browsingPast}
        expandAll={filter === 'all'}
      />{/if}
    <ol class="calendar-timeline">
      {#each slots as slot (slot.id)}
        {@const status = PortalCalendar.state(slot, slots, view.now)}
        {@const permanent =
          filter === 'all' ||
          (filter === 'free' ? slot.gap : !slot.gap && ['current', 'next'].includes(status))}
        <CalendarEvent
          silenced={silenced.has(reminderKey(slot))}
          silence={() => (silenced = new Set([...silenced, reminderKey(slot)]))}
          {slot}
          now={view.now}
          state={status}
          showEnd={slot.id === lastEvent?.id}
          approaching={status === 'next' &&
            view.settings.alertMinutes > 0 &&
            slot.start - view.now <= view.settings.alertMinutes * 60000}
          expanded={permanent ||
            expanded === slot.id ||
            (browsingPast && inspectedPast.has(slot.id))}
          language={view.language}
          {zone}
          enter={(immediate) => select(slot.id, immediate ? 0 : 150)}
          leave={() => select('', 180)}
          toggle={(open) => {
            clearTimeout(hoverTimer);
            expanded = (open ?? expanded !== slot.id) ? slot.id : '';
          }}
        />
      {/each}
    </ol>
  </div>
  {#if !slots.length && !allDay.length && !view.snapshot.notices.length}<p class="settings-help">
      {t('No events today.')}
    </p>{/if}
{/if}
