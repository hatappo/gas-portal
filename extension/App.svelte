<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';
  import externalLinkIcon from '../src/assets/external-link.svg?raw';
  import refreshIcon from '../src/assets/refresh-cw.svg?raw';
  import settingsIcon from '../src/assets/settings.svg?raw';
  import eyeIcon from '../src/assets/eye.svg?raw';
  import eyeOffIcon from '../src/assets/eye-off.svg?raw';
  import { embeddedPortalUrl, isReadyMessage, normalizePortalUrl } from '../src/browser/side-panel-protocol';
  let languagePreference = $state<'auto' | 'ja' | 'en'>('auto');
  let browserLanguages = $state(Array.from(navigator.languages));
  let languageBusy = $state(false);
  let languageStatus = $state('');
  const language = $derived(PortalI18n.resolve(languagePreference, browserLanguages));
  $effect(() => { document.documentElement.lang = language; });
  const t = (key: string) => PortalI18n.t(key, language);
  const extensionId = browser.runtime.id;
  const extensionName = browser.runtime.getManifest().name;
  // Conceal content until the session preference has been restored: no startup flash.
  let privacyMode = $state(true), privacyReady = $state(false), privacyBusy = $state(false);
  let privacyError = $state('');
  let lastPrivacyClick: number | undefined;
  const concealed = $derived(!privacyReady || privacyMode);
  const privacyLabel = $derived(t(privacyMode ? 'Double-click to show content' : 'Click to hide content'));
  async function togglePrivacy(event: MouseEvent) {
    if (!privacyReady || privacyBusy) return;
    const now = performance.now();
    if (privacyMode && (lastPrivacyClick === undefined || now - lastPrivacyClick > 400)) {
      // Do not treat the second click of a hide gesture as the start of a reveal.
      if (event.detail < 2) lastPrivacyClick = now;
      return;
    }
    lastPrivacyClick = undefined;
    const next = !privacyMode;
    privacyBusy = true;
    privacyError = '';
    // Hiding is immediate; showing waits for a successful save.
    privacyMode = true;
    try {
      await browser.storage.session.set({ privacyMode: next });
      privacyMode = next;
    } catch {
      privacyMode = true;
      privacyError = 'Could not save visibility. Content remains hidden. Double-click to try again.';
    } finally { privacyBusy = false; }
  }
  let url = $state(''), draft = $state(''), frameUrl = $state(''), nonce = '';
  let editing = $state(true), error = $state(''), busy = $state(true);
  let status = $state<'waiting' | 'ready' | 'unconfirmed'>('waiting');
  let timer: ReturnType<typeof setTimeout> | undefined;
  function connect() {
    if (!url) return;
    clearTimeout(timer);
    nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
    frameUrl = embeddedPortalUrl(url, nonce);
    status = 'waiting';
    timer = setTimeout(() => { status = 'unconfirmed'; }, 15000);
  }
  async function save(event: SubmitEvent) {
    event.preventDefault();
    const normalized = normalizePortalUrl(draft);
    if (!normalized) { error = 'Enter a deployed GAS web app URL ending in /exec.'; return; }
    busy = true;
    error = '';
    try {
      await browser.storage.local.set({ portalUrl: normalized });
      url = draft = normalized;
      editing = false;
      connect();
    } catch { error = 'Could not save the connection. Try again.'; }
    finally { busy = false; }
  }
  function openTab() {
    if (url) void browser.tabs.create({ url }).catch(() => { error = 'Could not open the portal.'; });
  }
  async function saveLanguage(event: Event) {
    const input = event.currentTarget as HTMLSelectElement;
    const next = input.value;
    if (next !== 'auto' && next !== 'ja' && next !== 'en') return;
    if (languageBusy || busy) { input.value = languagePreference; return; }
    languageBusy = true;
    languageStatus = '';
    try {
      await browser.storage.local.set({ languagePreference: next });
      languagePreference = next;
      languageStatus = 'Saved';
    } catch {
      input.value = languagePreference;
      languageStatus = 'Could not save the language. Please try again.';
    } finally { languageBusy = false; }
  }
  onMount(() => {
    const updateBrowserLanguage = () => { browserLanguages = Array.from(navigator.languages); };
    window.addEventListener('languagechange', updateBrowserLanguage);
    const receive = (event: MessageEvent) => {
      if (!isReadyMessage(event.origin, event.data, nonce)) return;
      clearTimeout(timer);
      status = 'ready';
    };
    window.addEventListener('message', receive);
    let disposed = false;
    let privacyChanged = false;
    const syncPrivacy = (changes: Record<string, { newValue?: unknown }>, area: string) => {
      if (area !== 'session' || !changes.privacyMode) return;
      privacyChanged = true;
      lastPrivacyClick = undefined;
      privacyMode = changes.privacyMode.newValue !== false;
    };
    browser.storage.onChanged.addListener(syncPrivacy);
    void browser.storage.session.get('privacyMode').then(saved => {
      if (!disposed && !privacyChanged) privacyMode = saved.privacyMode === true;
    }).catch(() => {
      if (!disposed) privacyError = 'Could not restore visibility. Content remains hidden. Double-click to show it.';
    }).finally(() => { if (!disposed) privacyReady = true; });
    void browser.storage.local.get(['portalUrl', 'languagePreference']).then(saved => {
      if (disposed) return;
      languagePreference = PortalI18n.preference(saved.languagePreference);
      const restored = typeof saved.portalUrl === 'string' ? normalizePortalUrl(saved.portalUrl) : null;
      if (restored) { url = draft = restored; editing = false; connect(); }
    }).catch(() => { if (!disposed) error = 'Could not read the connection. Enter the URL again.'; })
      .finally(() => { if (!disposed) busy = false; });
    return () => {
      disposed = true; clearTimeout(timer);
      window.removeEventListener('message', receive);
      window.removeEventListener('languagechange', updateBrowserLanguage);
      browser.storage.onChanged.removeListener(syncPrivacy);
    };
  });
</script>

<div class="panel-content" class:concealed>
<div class="panel-body" inert={concealed} aria-hidden={concealed}>
{#if editing}
  <main id="extension-settings">
    <h1>{t('Settings')}</h1>
    <h2>{t('Portal connection')}</h2>
    <p>{t('Use your existing GAS deployment. Your portal settings and service tokens stay in GAS.')}</p>
    <form onsubmit={save}>
      <label for="portal-url">{t('GAS web app URL')}</label>
      <input class="input" id="portal-url" type="url" bind:value={draft} placeholder="https://script.google.com/macros/s/…/exec" required disabled={busy} autocomplete="off" spellcheck="false" />
      <div class="actions"><button class="btn preset-filled-primary-500" disabled={busy}>{t('Save and connect')}</button></div>
    </form>
    <p>{t('Open the portal in a browser tab. In Settings → Extension, add this ID and save, then reload this panel.')}</p>
    <code>{extensionId}</code>
    <p>{t('Keep the web app private. Open it in a normal tab to sign in and authorize access, then reload this panel.')}</p>
    <section class="language-settings" aria-labelledby="extension-language-label">
      <label id="extension-language-label" for="extension-language">{t('Language')}</label>
      <select id="extension-language" class="select" value={languagePreference} disabled={busy || languageBusy} onchange={saveLanguage} aria-describedby="extension-language-help extension-language-status">
        <option value="auto">{t('Automatic (browser)')}</option>
        <option value="ja" lang="ja">日本語</option>
        <option value="en" lang="en">English</option>
      </select>
      <p id="extension-language-help">{t('Applies to extension controls only. The portal keeps its own language setting. Changes are saved automatically.')}</p>
      <p id="extension-language-status" class:error={languageStatus !== '' && languageStatus !== 'Saved'} role="status" aria-live="polite">{t(languageStatus)}</p>
    </section>
  </main>
{/if}
{#if error}<p class="status error" role="alert">{t(error)}</p>{/if}
{#if frameUrl}
  {#if !editing && status !== 'ready'}
    <p class="status" role="status">{status === 'waiting'
      ? t('Waiting for portal confirmation…')
      : t('Could not confirm the connection. Check the extension ID and deployment, then open the portal in a tab to sign in. Google may block embedding.')}</p>
  {/if}
  {#key frameUrl}<iframe src={frameUrl} title={t('Your portal')} hidden={editing} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads" referrerpolicy="no-referrer"></iframe>{/key}
{/if}

</div>
</div>
<footer class:concealed>
  <span class="extension-name">{extensionName}</span>
  <nav aria-label={t('Side panel controls')}>
    <button id="privacy-toggle" class="btn icon-button" disabled={!privacyReady || privacyBusy} aria-pressed={privacyMode} aria-label={privacyLabel} title={privacyLabel} aria-describedby="privacy-keyboard-help" onclick={togglePrivacy} onblur={() => { lastPrivacyClick = undefined; }} onkeydown={(event) => { if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault(); }}>
      <span class="privacy-current" aria-hidden="true">{@html privacyMode ? eyeOffIcon : eyeIcon}</span>
      <span class="privacy-action" aria-hidden="true">{@html privacyMode ? eyeIcon : eyeOffIcon}</span>
    </button>
    <button class="btn icon-button" disabled={!url || concealed} onclick={openTab} aria-label={t('Open tab')} title={t('Open tab')}>{@html externalLinkIcon}</button>
    <button class="btn icon-button" disabled={!url || editing || concealed} onclick={connect} aria-label={t('Reload')} title={t('Reload')}>{@html refreshIcon}</button>
    <button class="btn icon-button" disabled={concealed} aria-expanded={editing} aria-controls="extension-settings" onclick={() => { editing = !editing || !url; }} aria-label={t('Settings')} title={t('Settings')}>{@html settingsIcon}</button>

  </nav>
  <span id="privacy-keyboard-help" class="sr-only">{t('Press Enter or Space once to hide content, twice to show it.')}</span>
  {#if privacyError}<p class="privacy-error" role="alert">{t(privacyError)}</p>{/if}
</footer>
