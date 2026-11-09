import { For, Show, createSignal } from 'solid-js';
import { render } from 'solid-js/web';

type Actions = ReturnType<typeof import('./action-items.js').initializeActions>;
function gmailRpc<T>(send: (runner: GasRunner) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('REQUEST_FAILED')), 15000);
    try { send(google.script.run.withSuccessHandler((response: T) => { clearTimeout(timer); resolve(response); }).withFailureHandler(() => { clearTimeout(timer); reject(new Error('REQUEST_FAILED')); })); }
    catch { clearTimeout(timer); reject(new Error('REQUEST_FAILED')); }
  });
}
export function initializeGmail(actions: Actions) {
  const [language, setLanguage] = createSignal(document.documentElement.lang);
  const [settings, setSettings] = createSignal(PortalGmail.defaults());
  const [draft, setDraft] = createSignal(PortalGmail.defaults());
  const [initialized, setInitialized] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [error, setError] = createSignal('');
  const [saved, setSaved] = createSignal(false);
  const t = (key: string) => PortalI18n.t(key, language());
  const errorMessage = (code: string) => ({
    AUTHORIZATION_REQUIRED: 'Gmail authorization is required. Run authorizePortal in Authorization.gs in the GAS editor, then grant access and reload the portal.',
    FORBIDDEN: 'Gmail access was denied. Check your account permissions and enable the Gmail API in your Cloud project if needed.',
    RATE_LIMITED: 'Gmail rate limit reached. Wait a few minutes before refreshing.',
    SETTINGS_CHANGED: 'Gmail settings changed during this request. Refresh Action Items.',
    DISABLED: 'Gmail is disabled. Refresh Action Items.',
  } as Record<string, string>)[code] || 'Could not load Gmail data. Check authorization and try again.';
  actions.setProviderState('gmail', { ready: false, loading: false, error: '' });
  function normalize(response: GmailActionsResponse): ActionResult {
    if (!response?.ok) return { items: [], notices: [{ message: errorMessage(response?.error || '') }] };
    const valid = PortalGmail.validEmail(response.account) && Number.isFinite(response.fetchedAt) && typeof response.hasMore === 'boolean' && typeof response.partial === 'boolean' && typeof response.error === 'string' && Array.isArray(response.items) && response.items.length <= 100 && response.items.every(item =>
      PortalGmail.validId(item?.id) && PortalGmail.validId(item.threadId) && typeof item.title === 'string' && typeof item.sender === 'string' && Number.isFinite(Date.parse(item.receivedAt)));
    if (!valid) return { items: [], notices: [{ message: errorMessage('') }] };
    return {
      fetchedAt: response.fetchedAt, cached: response.cached, hasMore: response.hasMore,
      items: response.items.map(item => ({ service: 'gmail', serviceLabel: 'Gmail', id: response.account + ':' + item.id, title: item.title, titleFallback: '(No subject)', url: PortalGmail.url(response.account, item.threadId), context: item.sender, updatedAt: item.receivedAt, dateLabel: 'Received', reasons: ['Unread mail'] })),
      notices: response.error || response.partial ? [{ message: response.error ? errorMessage(response.error) : 'Only part of the results could be retrieved.' }] : [],
    };
  }
  function publish() {
    actions.setSources('gmail', settings().enabled ? [{
      id: 'google', get label() { return PortalI18n.t('Unread mail', document.documentElement.lang); }, serviceLabel: 'Gmail',
      load(force, done) {
        const fail = () => done(normalize({ ok: false, error: 'REQUEST_FAILED' }));
        try { google.script.run.withSuccessHandler((response: GmailActionsResponse) => done(normalize(response))).withFailureHandler(fail).getGmailActionItems(force); }
        catch { fail(); }
      },
    }] : []);
  }
  async function initialize() {
    if (initialized() || busy()) return;
    setBusy(true); setError('');
    actions.setProviderState('gmail', { ready: false, loading: true, error: '' });
    try {
      const response = await gmailRpc<GmailSettingsResponse>(runner => runner.getGmailSettings());
      if (!response?.ok || !PortalGmail.validSettings(response.settings)) throw new Error();
      setSettings(response.settings); setDraft({ ...response.settings }); setInitialized(true); publish();
    } catch {
      setError('Could not load Gmail settings. Try again.');
      actions.setProviderState('gmail', { ready: false, loading: false, error: 'Could not load Gmail settings. Try again.' });
    } finally { setBusy(false); }
  }
  async function save() {
    if (busy() || !initialized()) return;
    const input = { ...draft() };
    setBusy(true); setError(''); setSaved(false);
    try {
      const response = await gmailRpc<GmailSettingsResponse>(runner => runner.saveGmailSettings(input));
      if (!response?.ok || !PortalGmail.validSettings(response.settings)) throw new Error();
      setSettings(response.settings); setDraft({ ...response.settings }); setSaved(true); publish();
    } catch { setError('Could not confirm the save. Reload the page to check.'); }
    finally { setBusy(false); }
  }
  render(() => <>
    <div class="settings-heading"><h2 id="gmail-settings-title">Gmail</h2><p>{t('Show unread mail for the Google account running this app. Open Gmail to read or reply.')}</p></div>
    <p class="settings-help">{t('Only subjects, senders, labels and dates are read. Bodies and attachments are not accessed. Spam and trash are excluded; archived unread mail is included.')}</p>
    <Show when={busy()}><div class="refresh-catalog actions-loading" role="status" aria-label={t('Loading…')} aria-busy="true">{document.querySelector<HTMLTemplateElement>('#gmail-refresh-icon')!.content.cloneNode(true)}</div></Show>
    <form id="gmail-settings-form" onSubmit={event => { event.preventDefault(); void save(); }}>
      <fieldset disabled={busy() || !initialized()}>
        <label class="gmail-enabled"><input id="gmail-enabled" type="checkbox" class="toggle toggle-sm" checked={draft().enabled} onChange={event => setDraft({ ...draft(), enabled: event.currentTarget.checked })}/><span>{t('Show unread Gmail in Action Items')}</span></label>
        <label class="settings-field"><span id="gmail-limit-label">{t('Maximum unread messages')}</span><select id="gmail-limit" aria-labelledby="gmail-limit-label" class="select" value={draft().limit} onChange={event => setDraft({ ...draft(), limit: Number(event.currentTarget.value) })}><For each={PortalGmail.limits}>{limit => <option value={limit}>{limit}</option>}</For></select></label>
        <p class="settings-help">{t('20 by default. Each unread message is one item. Uses the shared Action Items cache; Fetch latest refreshes all services.')}</p>
        <button type="submit" class="btn btn-primary">{t('Save changes')}</button>
      </fieldset>
    </form>
    <Show when={error()}><p class="gmail-status alert alert-error alert-soft" role="alert">{t(error())}</p></Show>
    <Show when={saved() && !error()}><p class="settings-form-status" role="status">{t('Saved')}</p></Show>
    <Show when={!initialized() && error()}><button type="button" class="btn btn-ghost btn-sm" disabled={busy()} onClick={() => void initialize()}>{t('Try again')}</button></Show>
  </>, document.getElementById('gmail-settings-host')!);
  const onTab = () => { if (!document.getElementById('actions-panel')!.hidden || !document.getElementById('settings-panel')!.hidden) void initialize(); };
  document.addEventListener('portal:tabchange', onTab);
  document.addEventListener('portal:refresh-actions', () => { if (!initialized()) void initialize(); });
  document.addEventListener('portal:languagechange', () => setLanguage(document.documentElement.lang));
  onTab();
}
