<script lang="ts">
  import ServiceLogo from './ServiceLogo.svelte';
  import CalendarEvent from './CalendarEvent.svelte';
  import type { CalendarViewState, CalendarCommands } from './calendar-types';
  let props: {
    state: CalendarViewState;
    draft: CalendarSettings;
    change: (settings: CalendarSettings) => void;
    commands: CalendarCommands;
  } = $props();
  const tr = (key: string, language: string, values = {}) => PortalI18n.t(key, language, values);
  const t = (key: string) => tr(key, props.state.language);
  let showSample = $state(false),
    sampleSilenced = $state(false);
  const sampleMinutes = () => props.draft.alertMinutes || 3;
  const sampleSlot = (): CalendarSlot => {
    const start = props.state.now + sampleMinutes() * 60000;
    return {
      id: 'sample',
      start,
      end: start + 1800000,
      gap: false,
      event: {
        id: 'sample',
        calendarId: 'sample',
        calendarName: t('Sample'),
        title: t('Sample event'),
        start,
        end: start + 1800000,
        allDay: false,
        busy: true,
        color: '#38a1db',
        url: '',
        meetingUrl: '',
      },
    };
  };
  const change = (patch: Partial<CalendarSettings>) => props.change({ ...props.draft, ...patch });
</script>

<div class="calendar-settings">
  {#if !props.state.initialized && props.state.settingsError}<p
      class="calendar-notice alert portal-alert-error portal-alert-soft"
      role="alert"
    >
      {props.state.settingsError}
    </p>
    <button
      type="button"
      class="btn button-quiet btn-sm"
      disabled={props.state.busy}
      onclick={props.commands.refresh}
    >
      {t('Fetch latest')}
    </button>{/if}
  <form
    onsubmit={(event) => {
      event.preventDefault();
      props.commands.save(props.draft);
    }}
  >
    <fieldset disabled={props.state.saving || !props.state.initialized}>
      <div class="cache-settings">
        <label class="settings-field">
          <span id="calendar-cache-label">{t('Calendar cache duration')}</span>
          <select
            class="select"
            aria-labelledby="calendar-cache-label"
            aria-describedby="calendar-cache-help"
            value={props.draft.cacheSeconds}
            onchange={(event) => change({ cacheSeconds: Number(event.currentTarget.value) })}
          >
            {#each PortalCacheDurations.actions.choices as seconds}<option value={seconds}>
                {t(PortalCacheDurations.label('actions', seconds))}
              </option>{/each}
          </select>
        </label>
        <p id="calendar-cache-help">
          {t('Reuse data for this duration. Fetch latest bypasses the cache.')}{t(
            'Refreshes automatically while the calendar is visible.',
          )}{t('Use Save changes to apply.')}
        </p>
      </div>
      <section aria-labelledby="calendar-settings-title">
        <h2 id="calendar-settings-title">
          <ServiceLogo service="calendar" label="Google Calendar" decorative />Google Calendar
        </h2>
        <p class="settings-help">
          {t(
            'Show today’s schedule in a side panel using the Google account running this app. Calendar access is read-only.',
          )}
        </p>
        <div class="calendar-choices-heading">
          <span>{t('Calendars (up to 5)')}</span>
          <button
            type="button"
            class="btn button-quiet btn-sm"
            disabled={props.state.choicesBusy}
            aria-describedby={props.state.choicesError ? 'calendar-choices-error' : undefined}
            onclick={props.commands.loadChoices}
          >
            {t('Load calendars')}
          </button>
        </div>
        {#if props.state.choicesError}<p
            id="calendar-choices-error"
            class="calendar-notice alert portal-alert-error portal-alert-soft"
            role="alert"
          >
            {props.state.choicesError}
          </p>{/if}
        <div
          class="calendar-choices"
          aria-busy={(!props.state.initialized && props.state.busy) || props.state.choicesBusy}
        >
          {#each props.state.calendars as calendar}<label>
              <input
                type="checkbox"
                class="checkbox"
                checked={props.draft.calendarIds.includes(calendar.id)}
                onchange={(event) =>
                  change({
                    calendarIds: event.currentTarget.checked
                      ? [...props.draft.calendarIds, calendar.id]
                      : props.draft.calendarIds.filter((id) => id !== calendar.id),
                  })}
              />
              <span>{calendar.name || calendar.id}</span>
            </label>{/each}
        </div>
        <div class="calendar-notice-setting">
          <div class="calendar-notice-heading">
            <label id="calendar-alert-label" for="calendar-alert-select">
              {t('Upcoming-event notice')}
            </label>
            <button
              type="button"
              class="btn button-quiet btn-sm"
              aria-expanded={showSample}
              aria-controls="calendar-notice-sample"
              onclick={() => {
                sampleSilenced = false;
                showSample = !showSample;
              }}
            >
              {t('Preview notice')}
            </button>
          </div>
          <select
            id="calendar-alert-select"
            class="select"
            aria-labelledby="calendar-alert-label"
            value={props.draft.alertMinutes}
            onchange={(event) => change({ alertMinutes: Number(event.currentTarget.value) })}
          >
            {#each [0, 1, 2, 3, 5, 10, 15] as minutes}<option value={minutes}>
                {minutes
                  ? tr('{minutes} minutes before', props.state.language, { minutes })
                  : t('Disabled')}
              </option>{/each}
          </select>
          {#if showSample}<div id="calendar-notice-sample" class="calendar-notice-sample">
              <ol class="calendar-timeline">
                <CalendarEvent
                  silenced={sampleSilenced}
                  silence={() => (sampleSilenced = true)}
                  slot={sampleSlot()}
                  state="next"
                  expanded
                  approaching
                  showEnd={false}
                  now={props.state.now}
                  language={props.state.language}
                  zone={Intl.DateTimeFormat().resolvedOptions().timeZone}
                  enter={() => {}}
                  leave={() => {}}
                  toggle={() => {}}
                />
              </ol>
            </div>{/if}
        </div>
        <p class="settings-help">
          {t(
            'Notices appear inside the portal while it is open. Browser-local time is used. Hidden tabs and sleeping devices may delay notices.',
          )}
        </p>
      </section>
      <button type="submit" class="btn preset-filled-primary-500">{t('Save changes')}</button>
    </fieldset>
  </form>
  {#if props.state.initialized && props.state.settingsError}<p
      class="calendar-notice alert portal-alert-error portal-alert-soft"
      role="alert"
    >
      {props.state.settingsError}
    </p>{/if}{#if props.state.saved}<p class="settings-form-status" role="status">
      {t('Saved')}
    </p>{/if}
</div>
