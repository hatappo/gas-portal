(() => {
  'use strict';
  const form = /** @type {HTMLFormElement} */ (document.getElementById('portal-settings-form'));
  const fields = /** @type {HTMLFieldSetElement} */ (document.getElementById('portal-settings-fields'));
  const status = /** @type {HTMLElement} */ (document.getElementById('portal-settings-status'));
  const inputs = {
    PORTAL_NAME: /** @type {HTMLInputElement} */ (document.getElementById('setting-name')),
    PORTAL_ICON: /** @type {HTMLInputElement} */ (document.getElementById('setting-icon')),
    PORTAL_HEADLINE: /** @type {HTMLInputElement} */ (document.getElementById('setting-headline')),
    PORTAL_DESCRIPTION: /** @type {HTMLTextAreaElement} */ (document.getElementById('setting-description')),
  };
  const keys = /** @type {(keyof PortalSettings)[]} */ (Object.keys(inputs));
  let generation = 0;

  function readForm() {
    return {
      PORTAL_NAME: inputs.PORTAL_NAME.value,
      PORTAL_ICON: inputs.PORTAL_ICON.value,
      PORTAL_HEADLINE: inputs.PORTAL_HEADLINE.value,
      PORTAL_DESCRIPTION: inputs.PORTAL_DESCRIPTION.value,
    };
  }

  /** @param {PortalSettings} settings */
  function apply(settings) {
    keys.forEach((key) => { inputs[key].value = settings[key]; });
    document.title = settings.PORTAL_NAME;
    const split = settings.PORTAL_NAME.search(/\s/);
    const rest = document.createElement('span');
    rest.textContent = split < 0 ? '' : settings.PORTAL_NAME.slice(split);
    document.querySelector('.brand-name')?.replaceChildren(document.createTextNode(split < 0 ? settings.PORTAL_NAME : settings.PORTAL_NAME.slice(0, split)), rest);
    const elements = { '.brand-mark': settings.PORTAL_ICON, '#page-title': settings.PORTAL_HEADLINE, '.intro-copy': settings.PORTAL_DESCRIPTION };
    Object.entries(elements).forEach(([selector, value]) => {
      const element = document.querySelector(selector);
      if (element) element.textContent = value;
    });
  }

  function save() {
    if (fields.disabled) return;
    const current = ++generation;
    fields.disabled = true;
    status.textContent = '保存中…';
    status.setAttribute('aria-busy', 'true');
    const finish = () => { fields.disabled = false; status.setAttribute('aria-busy', 'false'); };
    const timeout = window.setTimeout(() => {
      if (current !== generation) return;
      generation++;
      finish();
      status.textContent = '保存を確認できませんでした。ページを再読み込みして確認してください。';
    }, 15000);
    const failure = () => {
      window.clearTimeout(timeout);
      if (current !== generation) return;
      finish();
      status.textContent = '保存できませんでした。入力内容は保持しています。もう一度お試しください。';
    };
    try {
      const runner = google.script.run.withSuccessHandler((/** @type {PortalSettingsResponse} */ response) => {
        if (current !== generation) return;
        if (!response?.ok) {
          failure();
          if (response && typeof response.error === 'string') status.textContent = response.error;
          return;
        }
        if (!response.settings || !keys.every((key) => typeof response.settings[key] === 'string')) { failure(); return; }
        window.clearTimeout(timeout);
        apply(response.settings);
        finish();
        status.textContent = '保存しました';
      }).withFailureHandler(failure);
      runner.savePortalSettings(readForm());
    } catch { failure(); }
  }

  // 初期値は本番の HTML またはローカルのモックが埋め込む。
  apply(readForm());
  form.addEventListener('submit', (event) => { event.preventDefault(); save(); });
  document.getElementById('reset-portal-settings')?.addEventListener('click', () => {
    if (fields.disabled) return;
    const defaults = /** @type {PortalSettings} */ (JSON.parse(form.dataset.defaults || '{}'));
    keys.forEach((key) => { inputs[key].value = defaults[key]; });
    status.textContent = '入力欄を既定値に戻しました。反映するには「変更を保存」を押してください。';
  });
})();
