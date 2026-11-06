import { mountSettingsFields } from './settings-view';
import { createSaver, serverError } from './save-control.js';
export function initializeSettings() {
  /** @param {string} key @param {Record<string, string | number>} [values] */
  const t = (key, values = {}) => PortalI18n.t(key, document.documentElement.lang, values);
  const form = /** @type {HTMLFormElement} */ (document.getElementById('portal-settings-form'));
  const status = /** @type {HTMLElement} */ (document.getElementById('portal-settings-status'));
  const keys = /** @type {(keyof PortalSettings)[]} */ (['PORTAL_NAME', 'PORTAL_ICON', 'PORTAL_HEADLINE', 'PORTAL_DESCRIPTION']);
  const view = mountSettingsFields(form, () => {
    view.setValues(JSON.parse(form.dataset.defaults || '{}'));
    status.textContent = t('The fields have been reset. Select “Save changes” to apply them.');
  });
  const saveForm = createSaver({ status, t, setBusy: view.setBusy });

  /** @param {PortalSettings} settings */
  function apply(settings) {
    view.setValues(settings);
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
    if (view.busy()) return;
    saveForm({
      send: (runner) => runner.savePortalSettings(view.read(), document.documentElement.lang),
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
    const draft = view.read();
    for (const key of ['PORTAL_HEADLINE', 'PORTAL_DESCRIPTION']) {
      const field = /** @type {'PORTAL_HEADLINE' | 'PORTAL_DESCRIPTION'} */ (key);
      const previous = defaults[field];
      const translated = PortalI18n.translate(previous, document.documentElement.lang);
      const presets = ['ja', 'en'].map((language) => PortalI18n.translate(previous, language));
      if (presets.includes(draft[field])) draft[field] = translated;
      const target = document.querySelector(field === 'PORTAL_HEADLINE' ? '#page-title' : '.intro-copy');
      if (target && presets.includes(target.textContent || '')) target.textContent = translated;
      defaults[field] = translated;
    }
    form.dataset.defaults = JSON.stringify(defaults);
    view.setValues(draft);
  }
  localizeDefaults();
  apply(view.read());
  document.addEventListener('portal:languagechange', localizeDefaults);
  form.addEventListener('submit', (event) => { event.preventDefault(); save(); });
}
