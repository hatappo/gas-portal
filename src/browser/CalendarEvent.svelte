<script lang="ts">
  import ChangingTime from './ChangingTime.svelte';
  import Icon from './Icon.svelte';
  const tr = (key: string, language: string, values = {}) => PortalI18n.t(key, language, values);
  let props: {
    slot: CalendarSlot;
    state: string;
    expanded: boolean;
    approaching: boolean;
    silenced: boolean;
    silence(): void;
    showEnd: boolean;
    now: number;
    language: string;
    zone: string;
    enter(immediate?: boolean): void;
    leave(): void;
    toggle(expanded?: boolean): void;
  } = $props();
  const activeReminder = () => props.approaching && !props.silenced;
  const current = () => props.state === 'current' && !props.slot.gap;
  const remaining = () =>
    Math.max(1, Math.ceil(((props.slot.event?.end ?? props.slot.end) - props.now) / 60000));
  const remainingText = () =>
    tr('{minutes} min remaining', props.language, { minutes: remaining() });
  const remainingMinutes = () => Math.max(1, Math.ceil((props.slot.start - props.now) / 60000));
  const title = () =>
    props.slot.gap
      ? tr('Free time', props.language)
      : props.slot.event?.title || tr('Busy', props.language);
  const start = () =>
    new Intl.DateTimeFormat(props.language, {
      timeZone: props.zone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(props.slot.start);
  const end = () => {
    const value = props.slot.event?.end ?? props.slot.end;
    const anotherDay =
      PortalCalendar.dateKey(value, props.zone) !==
      PortalCalendar.dateKey(props.slot.start, props.zone);
    return new Intl.DateTimeFormat(props.language, {
      timeZone: props.zone,
      ...(anotherDay ? ({ month: 'numeric', day: 'numeric' } as const) : {}),
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(value);
  };
  const minutes = () => Math.round((props.slot.end - props.slot.start) / 60000);
  const timeText = (duration: string) =>
    start() + ' \u00b7 ' + duration + (props.showEnd ? ' ~ ' + end() : '');
  const time = () => timeText(minutes() + '′');
  const label = () =>
    timeText(tr('{minutes} min', props.language, { minutes: minutes() })) +
    ' \u00b7 ' +
    title() +
    (current() ? ' · ' + remainingText() : '');
  const progress = () => {
    const event = props.slot.event;
    return event
      ? Math.max(
          0,
          Math.min(100, ((props.now - event.start) / (event.end - event.start)) * 100),
        ).toFixed(2) + '%'
      : '0%';
  };
  let row = $state<HTMLLIElement>(null!);
  let pointerExpanded = false;
</script>

<li
  bind:this={row}
  class="calendar-event"
  class:is-gap={props.slot.gap}
  class:is-approaching={activeReminder()}
  data-reminder-active={activeReminder()}
  data-state={props.state}
  data-expanded={props.expanded}
  data-last={props.showEnd}
  style:--event-color={props.slot.event?.color || 'var(--color-surface-950-50)'}
  style:--event-progress={progress()}
  onpointerenter={(event) => {
    if (event.pointerType !== 'touch') props.enter();
  }}
  onpointerleave={props.leave}
  onfocusin={() => props.enter(true)}
  onfocusout={(event) => {
    if (!row.contains(event.relatedTarget as Node)) props.leave();
  }}
>
  {#if current() && props.expanded}<span
      class="calendar-remaining-label"
      lang={props.language}
      aria-hidden="true"
    >
      <ChangingTime text={tr('{minutes}′ left', props.language, { minutes: remaining() })} />
    </span>{/if}
  <button
    type="button"
    class="calendar-event-trigger"
    aria-label={label()}
    aria-expanded={props.expanded}
    onpointerdown={() => (pointerExpanded = props.expanded)}
    onclick={(event) => props.toggle(event.detail > 0 ? !pointerExpanded : undefined)}
    title={current() ? title() + ' · ' + remainingText() : title()}
  >
    <span class="calendar-event-copy">
      <span class="calendar-event-time">{time()}{#if props.slot.gap}<Icon id="calendar-coffee-icon" />{/if}</span>
      <span class="calendar-event-title">{' · ' + title()}</span>
    </span>
  </button>
  <div class="calendar-event-detail" aria-hidden={!props.expanded} inert={!props.expanded}>
    <div>
      {#if props.slot.event}{@const event = props.slot.event}
        <span class="calendar-source">{event.calendarName}</span>
        {#if event.url}<a
            class="link"
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
            tabindex={props.expanded ? 0 : -1}
          >
            {tr('Open event', props.language)}
          </a>{/if}
        {#if event.meetingUrl}<a
            class="link"
            href={event.meetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            tabindex={props.expanded ? 0 : -1}
          >
            {tr('Join meeting', props.language)}
          </a>{/if}
      {:else}<span>{tr('No scheduled events.', props.language)}</span>{/if}
    </div>
  </div>
  {#if props.state === 'next' && !props.slot.gap}<span
      class="calendar-next-badge"
      class:is-approaching={props.approaching}
      lang={props.language}
      aria-label={tr('Starts in {minutes} min', props.language, { minutes: remainingMinutes() })}
    >
      <ChangingTime
        text={tr('Next in {minutes}′', props.language, { minutes: remainingMinutes() })}
      />
    </span>{/if}
  {#if activeReminder()}<button
      type="button"
      class="calendar-silence btn button-quiet button-square"
      title={tr('Silence this reminder', props.language)}
      aria-label={tr('Silence this reminder', props.language)}
      onclick={() => {
        props.silence();
        row
          .querySelector<HTMLButtonElement>('.calendar-event-trigger')
          ?.focus({ preventScroll: true });
      }}
    >
      <Icon id="calendar-silence-icon" />
    </button>{/if}
</li>
