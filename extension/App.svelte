<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';
  import externalLinkIcon from '../src/assets/external-link.svg?raw';
  import refreshIcon from '../src/assets/refresh-cw.svg?raw';
  import settingsIcon from '../src/assets/settings.svg?raw';
  import eyeIcon from '../src/assets/eye.svg?raw';
  import eyeOffIcon from '../src/assets/eye-off.svg?raw';
  import ConnectionSettings from './ConnectionSettings.svelte';
  import { emptyConfig, restoreConfig, pageRequest, pageLabel, type PanelConfig } from './config';
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
  let config = $state<PanelConfig>(emptyConfig());
  const activePage = $derived(config.pages.find(page => page.id === config.activePageId));
  let frames = $state<{ id: string; sourceUrl: string; url: string; version: number }[]>([]);
  let frameVersion = 0;
  const frameUrl = $derived(frames.find(frame => frame.id === config.activePageId)?.url || '');
  let editing = $state(true), error = $state(''), busy = $state(true), loaded = $state(false);
  function connect(force = false) {
    // Retain visited pages. Removed pages or edited URLs discard only their own frame.
    frames = frames.filter(frame => config.pages.some(page => page.id === frame.id && page.url === frame.sourceUrl));
    if (!activePage || (!force && frames.some(frame => frame.id === activePage.id))) return;
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
    const url = pageRequest(config, nonce);
    if (!url) return;
    const next = { id: activePage.id, sourceUrl: activePage.url, url, version: ++frameVersion };
    const existing = frames.findIndex(frame => frame.id === next.id);
    if (existing >= 0) frames[existing] = next;
    else frames.push(next);
  }
  function closeSettings() { editing = false; }
  async function saveConfig(next: PanelConfig) {
    busy = true;
    try {
      await browser.storage.local.set({ panelConfig: next });
      config = next;
      error = '';
      editing = next.pages.length === 0;
      connect();
    } catch { throw new Error('Could not save the connection. Try again.'); }
    finally { busy = false; }
  }
  async function switchPage(event: Event) {
    const select = event.currentTarget as HTMLSelectElement;
    const id = select.value;
    if (busy || !config.pages.some(page => page.id === id)) { select.value = config.activePageId; return; }
    busy = true;
    try {
      const next = { ...$state.snapshot(config), activePageId: id };
      await browser.storage.local.set({ panelConfig: next });
      config = next;
      error = '';
      connect();
    } catch {
      select.value = config.activePageId;
      error = 'Could not save the connection. Try again.';
    } finally { busy = false; }
  }
  function openTab() {
    if (frameUrl) void browser.tabs.create({ url: frameUrl }).catch(() => { error = 'Could not open the page.'; });
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
    void browser.storage.local.get(['panelConfig', 'portalUrl', 'languagePreference']).then(saved => {
      if (disposed) return;
      languagePreference = PortalI18n.preference(saved.languagePreference);
      config = restoreConfig(saved);
      loaded = true;
      if (config.pages.length) { editing = false; connect(); }
    }).catch(() => { if (!disposed) error = 'Could not read the saved settings. Reload the panel to try again.'; })
      .finally(() => { if (!disposed) busy = false; });
    return () => {
      disposed = true;
      window.removeEventListener('languagechange', updateBrowserLanguage);
      browser.storage.onChanged.removeListener(syncPrivacy);
    };
  });
</script>

<div class="panel-content" class:concealed>
<div class="panel-body" inert={concealed} aria-hidden={concealed}>
{#if editing}
  <main id="extension-settings">
    <div class="settings-title-row"><h1>{t('Alcove settings')}</h1><button class="btn icon-button" type="button" disabled={busy} onclick={closeSettings} aria-label={t('Close settings')} title={t('Close settings')}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg></button></div>
    {#if loaded}
      <ConnectionSettings {config} {t} onsave={saveConfig} oncancel={closeSettings} />
    {/if}
    <section class="extension-id-settings">
    <label for="extension-id">{t('Extension ID')}</label>
    <input id="extension-id" class="input" readonly value={extensionId} onclick={(event) => event.currentTarget.select()} onfocus={(event) => event.currentTarget.select()} />
    </section>
    <section class="language-settings" aria-labelledby="extension-language-label">
      <label id="extension-language-label" for="extension-language">{t('Language')}</label>
      <select id="extension-language" class="select" value={languagePreference} disabled={busy || languageBusy} onchange={saveLanguage} aria-describedby="extension-language-status">
        <option value="auto">{t('Automatic (browser)')}</option>
        <option value="ja" lang="ja">日本語</option>
        <option value="en" lang="en">English</option>
      </select>
      <p id="extension-language-status" class:error={languageStatus !== '' && languageStatus !== 'Saved'} role="status" aria-live="polite">{t(languageStatus)}</p>
    </section>
  </main>
{/if}
{#if error}<p class="status error" role="alert">{t(error)}</p>{/if}
{#each frames as frame (frame.id)}
  {#key frame.version}<iframe src={frame.url} title={pageLabel(config.pages.find(page => page.id === frame.id)!)} hidden={editing || frame.id !== config.activePageId} inert={editing || frame.id !== config.activePageId} sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads" referrerpolicy="no-referrer"></iframe>{/key}
{/each}
{#if !editing && !frameUrl}<main class="empty-panel"><p>{t('No pages yet.')}</p><button class="btn preset-tonal" onclick={() => { editing = true; }}>{t('Open settings')}</button></main>{/if}

</div>
</div>
<footer class:concealed>
  <span class="extension-name">{extensionName}</span>
  {#if config.pages.length}
    <select class="select page-switcher" aria-label={t('Switch page')} value={config.activePageId} disabled={concealed || editing || busy} onchange={switchPage}>
      {#each config.pages as page (page.id)}<option value={page.id}>{concealed ? '•••' : pageLabel(page)}</option>{/each}
    </select>
  {/if}
  <nav aria-label={t('Side panel controls')}>
    <button id="privacy-toggle" class="btn icon-button" disabled={!privacyReady || privacyBusy} aria-pressed={privacyMode} aria-label={privacyLabel} title={privacyLabel} aria-describedby="privacy-keyboard-help" onclick={togglePrivacy} onblur={() => { lastPrivacyClick = undefined; }} onkeydown={(event) => { if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault(); }}>
      <span class="privacy-current" aria-hidden="true">{@html privacyMode ? eyeOffIcon : eyeIcon}</span>
      <span class="privacy-action" aria-hidden="true">{@html privacyMode ? eyeIcon : eyeOffIcon}</span>
    </button>
    <button class="btn icon-button" disabled={!activePage || concealed} onclick={openTab} aria-label={t('Open tab')} title={t('Open tab')}>{@html externalLinkIcon}</button>
    <button class="btn icon-button" disabled={!activePage || editing || concealed} onclick={() => connect(true)} aria-label={t('Reload')} title={t('Reload')}>{@html refreshIcon}</button>
    <button class="btn icon-button" disabled={concealed || busy} aria-expanded={editing} aria-controls="extension-settings" onclick={() => { editing = !editing; }} aria-label={t('Settings')} title={t('Settings')}>{@html settingsIcon}</button>

  </nav>
  <span id="privacy-keyboard-help" class="sr-only">{t('Press Enter or Space once to hide content, twice to show it.')}</span>
  {#if privacyError}<p class="privacy-error" role="alert">{t(privacyError)}</p>{/if}
</footer>
