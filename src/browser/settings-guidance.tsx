import { Show, createMemo, createSignal } from 'solid-js';
import { render } from 'solid-js/web';

type Section = 'actions' | 'tools' | 'calendar';
// Only known application messages receive links; arbitrary server text stays plain text.
const guidance: Record<string, { section: Section; template: string }> = {
  'Connect an inbox in Settings.': { section: 'actions', template: 'Connect an inbox in {settings}.' },
  'Connect a task service in Settings.': { section: 'actions', template: 'Connect a task service in {settings}.' },
  'Set a spreadsheet ID or Google Sheets URL in Settings.': { section: 'tools', template: 'Set a spreadsheet ID or Google Sheets URL in {settings}.' },
  'The specified sheet does not exist. Check that SHEET_NAME matches its name.': { section: 'tools', template: 'The specified sheet does not exist. Check the sheet name in {settings}.' },
  'Check your spreadsheet settings.': { section: 'tools', template: 'Check your spreadsheet connection in {settings}.' },
  'Select between one and five calendars.': { section: 'calendar', template: 'Select between one and five calendars in {settings}.' },
  'Calendar access was denied. Check calendar permissions and enable the Calendar API in your Cloud project if needed.': { section: 'calendar', template: 'Calendar access was denied. Review your calendar selection in {settings}, check calendar permissions, and enable the Calendar API in your Cloud project if needed.' },
  'More unread items are available. Increase the limit in Settings to show more.': { section: 'actions', template: 'More unread items are available. Increase the limit in {settings} to show more.' },
  'More search results are available. Increase the limit in Settings to show more.': { section: 'actions', template: 'More search results are available. Increase the limit in {settings} to show more.' },
  'Slack authorization expired or was revoked. Replace the token in Settings.': { section: 'actions', template: 'Slack authorization expired or was revoked. Replace the token in {settings}.' },
  'GitHub authorization expired or was revoked. Replace the token in Settings.': { section: 'actions', template: 'GitHub authorization expired or was revoked. Replace the token in {settings}.' },
};

export function SettingsGuidance(props: { message: string; language: string }) {
  const entry = createMemo(() => {
    const key = Object.keys(guidance).find(key => props.message === key || props.message === PortalI18n.t(key, 'ja'));
    return key ? guidance[key] : undefined;
  });
  const parts = () => PortalI18n.t(entry()!.template, props.language).split('{settings}');
  return <Show when={entry()} fallback={PortalI18n.translate(props.message, props.language)}>{item => <>
    {parts()[0]}<a class="link settings-guidance-link" href={'#settings/' + (item().section === 'actions' ? 'inbox-and-tasks' : item().section)} target="_self" onClick={event => {
      event.preventDefault();
      const tab = document.getElementById('settings-tab-' + item().section);
      tab?.click();
      tab?.focus({ preventScroll: true });
    }}>{PortalI18n.t('Settings', props.language)}</a>{parts()[1]}
  </>}</Show>;
}

export function mountSettingsGuidance(host: HTMLElement) {
  const [state, setState] = createSignal({ message: '', language: document.documentElement.lang });
  render(() => <SettingsGuidance message={state().message} language={state().language}/>, host);
  return (message: string, language: string) => setState({ message, language });
}
