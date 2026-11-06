import { createSaver, serverError } from './save-control.js';
export function initializeSettings() {
  /** @param {string} key @param {Record<string, string | number>} [values] */
  const t = (key, values = {}) => PortalI18n.t(key, document.documentElement.lang, values);
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
  const saveForm = createSaver({ status, t, setBusy: (busy) => { fields.disabled = busy; } });

  /** Keep the icon to one character while typing. maxlength counts UTF-16 units, so it cannot
   * do this for emoji or combining kana marks. Keep the character just typed, so typing next to
   * an existing letter replaces it. Wait for IME composition to finish before trimming.
   */
  function limitIcon() {
    const input = inputs.PORTAL_ICON;
    /** @param {string} text */
    const characters = (text) => Array.from(text.normalize('NFC')).filter((character) => character.trim());
    const all = characters(input.value);
    if (all.length <= 1 && input.value === input.value.normalize('NFC').trim()) return;
    const typed = characters(input.value.slice(0, input.selectionEnd ?? input.value.length));
    input.value = typed[typed.length - 1] ?? all[0] ?? '';
  }
  inputs.PORTAL_ICON.addEventListener('input', (event) => {
    if (!(/** @type {InputEvent} */ (event)).isComposing) limitIcon();
  });
  inputs.PORTAL_ICON.addEventListener('compositionend', limitIcon);

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
      if (element) {
        element.textContent = value;
        if (selector !== '.brand-mark') /** @type {HTMLElement} */ (element).hidden = !value;
      }
    });
    const intro = /** @type {HTMLElement} */ (document.querySelector('.intro'));
    intro.hidden = !settings.PORTAL_HEADLINE && !settings.PORTAL_DESCRIPTION;
    if (settings.PORTAL_HEADLINE) intro.setAttribute('aria-labelledby', 'page-title');
    else intro.removeAttribute('aria-labelledby');
  }

  function save() {
    if (fields.disabled) return;
    saveForm({
      send: (runner) => runner.savePortalSettings(readForm(), document.documentElement.lang),
      confirm: (/** @type {PortalSettingsResponse} */ response) => {
        if (!response?.ok) return serverError(response);
        if (!response.settings || !keys.every((key) => typeof response.settings[key] === 'string')) return false;
        apply(response.settings);
        return t("Saved");
      },
      // Keep the typed values so they can be saved again.
      failureMessage: "Could not save. Your input has been kept. Please try again.",
    });
  }

  // Initial values come from production HTML or the local mock.
  function localizeDefaults() {
    const defaults = /** @type {PortalSettings} */ (JSON.parse(form.dataset.defaults || '{}'));
    for (const key of ['PORTAL_HEADLINE', 'PORTAL_DESCRIPTION']) {
      const field = /** @type {'PORTAL_HEADLINE' | 'PORTAL_DESCRIPTION'} */ (key);
      const previous = defaults[field];
      const translated = PortalI18n.translate(previous, document.documentElement.lang);
      const presets = ['ja', 'en'].map((language) => PortalI18n.translate(previous, language));
      if (presets.includes(inputs[field].value)) inputs[field].value = translated;
      const target = document.querySelector(field === 'PORTAL_HEADLINE' ? '#page-title' : '.intro-copy');
      if (target && presets.includes(target.textContent || '')) target.textContent = translated;
      defaults[field] = translated;
    }
    form.dataset.defaults = JSON.stringify(defaults);
  }
  localizeDefaults();
  apply(readForm());
  document.addEventListener('portal:languagechange', localizeDefaults);
  form.addEventListener('submit', (event) => { event.preventDefault(); save(); });
  document.getElementById('reset-portal-settings')?.addEventListener('click', () => {
    if (fields.disabled) return;
    const defaults = /** @type {PortalSettings} */ (JSON.parse(form.dataset.defaults || '{}'));
    keys.forEach((key) => { inputs[key].value = defaults[key]; });
    status.textContent = t("The fields have been reset. Select “Save changes” to apply them.");
  });
}
