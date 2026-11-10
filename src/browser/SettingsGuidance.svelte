<script lang="ts">
  type Section = 'sources' | 'calendar';
  // Only known application messages receive links; arbitrary server text stays plain text.
  const guidance: Record<string, { section: Section; template: string }> = {
    'Could not load Slack saved messages. Check the connection in Sources.': {
      section: 'sources',
      template: 'Could not load Slack saved messages. Check the connection in {settings}.',
    },
    'Only part of the saved messages could be retrieved. Check the connection in Sources.': {
      section: 'sources',
      template:
        'Only part of the saved messages could be retrieved. Check the connection in {settings}.',
    },
    'Connect an inbox in Settings.': {
      section: 'sources',
      template: 'Connect an inbox in {settings}.',
    },
    'Connect a task service in Settings.': {
      section: 'sources',
      template: 'Connect a task service in {settings}.',
    },
    'Set a spreadsheet ID or Google Sheets URL in Settings.': {
      section: 'sources',
      template: 'Set a spreadsheet ID or Google Sheets URL in {settings}.',
    },
    'The specified sheet does not exist. Check that SHEET_NAME matches its name.': {
      section: 'sources',
      template: 'The specified sheet does not exist. Check the sheet name in {settings}.',
    },
    'Check your spreadsheet settings.': {
      section: 'sources',
      template: 'Check your spreadsheet connection in {settings}.',
    },
    'Select between one and five calendars.': {
      section: 'calendar',
      template: 'Select between one and five calendars in {settings}.',
    },
    'Calendar access was denied. Check calendar permissions and enable the Calendar API in your Cloud project if needed.':
      {
        section: 'calendar',
        template:
          'Calendar access was denied. Review your calendar selection in {settings}, check calendar permissions, and enable the Calendar API in your Cloud project if needed.',
      },
    'More unread items are available. Increase the limit in Settings to show more.': {
      section: 'sources',
      template: 'More unread items are available. Increase the limit in {settings} to show more.',
    },
    'Slack authorization expired or was revoked. Replace the token in Settings.': {
      section: 'sources',
      template: 'Slack authorization expired or was revoked. Replace the token in {settings}.',
    },
    'GitHub authorization expired or was revoked. Replace the token in Settings.': {
      section: 'sources',
      template: 'GitHub authorization expired or was revoked. Replace the token in {settings}.',
    },
  };

  let { message, language }: { message: string; language: string } = $props();
  let entry = $derived.by(() => {
    const key = Object.keys(guidance).find(
      (key) => message === key || message === PortalI18n.t(key, 'ja'),
    );
    return key ? guidance[key] : undefined;
  });
  let parts = $derived(entry ? PortalI18n.t(entry.template, language).split('{settings}') : []);
</script>

{#if entry}
  {parts[0]}
  <a
    class="link settings-guidance-link"
    href={'#settings/' + entry.section}
    target="_self"
    onclick={(event) => {
      event.preventDefault();
      const tab = document.getElementById('settings-tab-' + entry!.section);
      tab?.click();
      tab?.focus({ preventScroll: true });
    }}
  >
    {PortalI18n.t('Settings', language)}
  </a>
  {parts[1]}
{:else}{PortalI18n.translate(message, language)}{/if}
