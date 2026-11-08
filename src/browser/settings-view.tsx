import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { useLanguage } from './ui';

/** Enhance the server-rendered form, preserving its initial values and outer status region. */
export function mountSettingsFields(form: HTMLFormElement, reset: () => void) {
  // Unlike FormData, this also reads while the fieldset is disabled for a save.
  const read = (): PortalSettings => Object.fromEntries(
    Array.from(form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[name]'), input => [input.name, input.value]),
  ) as unknown as PortalSettings;
  const [draft, setDraft] = createSignal(read());
  const [busy, setBusy] = createSignal(false);
  const source = form.querySelector('#portal-settings-fields')!;
  const host = document.createElement('div');
  source.replaceWith(host);
  const update = (key: keyof PortalSettings, value: string) => setDraft(previous => ({ ...previous, [key]: value }));
  // Do not truncate an IME composition. The caret identifies the newly typed character.
  function updateIcon(input: HTMLInputElement, composing = false) {
    if (!composing) {
      const chars = (text: string) => Array.from(text.normalize('NFC')).filter(char => char.trim());
      const all = chars(input.value);
      if (all.length > 1 || input.value !== input.value.normalize('NFC').trim()) {
        const typed = chars(input.value.slice(0, input.selectionEnd ?? input.value.length));
        input.value = typed[typed.length - 1] ?? all[0] ?? '';
      }
    }
    update('PORTAL_ICON', input.value);
  }
  render(() => {
    const language = useLanguage();
    const t = (key: string) => PortalI18n.t(key, language());
    return <fieldset id="portal-settings-fields" disabled={busy()}>
      <legend class="visually-hidden">{t('Portal display settings')}</legend>
      <div class="settings-fields-row">
        <label class="settings-field"><span>{t('Portal name')}</span><input id="setting-name" class="input w-full" name="PORTAL_NAME" maxLength={80} autocomplete="off" value={draft().PORTAL_NAME} on:input={e => update('PORTAL_NAME', e.currentTarget.value)} /></label>
        <label class="settings-field settings-icon-field"><span>{t('Icon')}</span><input id="setting-icon" class="input w-full" name="PORTAL_ICON" maxLength={8} autocomplete="off" aria-describedby="icon-help" value={draft().PORTAL_ICON} on:input={e => updateIcon(e.currentTarget, e.isComposing)} on:compositionend={e => updateIcon(e.currentTarget)} /><span id="icon-help">{t('1 character')}</span></label>
      </div>
      <label class="settings-field"><span>{t('Headline')}</span><input id="setting-headline" class="input w-full" name="PORTAL_HEADLINE" maxLength={160} autocomplete="off" aria-describedby="intro-help" value={draft().PORTAL_HEADLINE} on:input={e => update('PORTAL_HEADLINE', e.currentTarget.value)} /></label>
      <label class="settings-field"><span>{t('Notes')}</span><textarea id="setting-description" class="textarea w-full" name="PORTAL_DESCRIPTION" maxLength={500} rows={3} aria-describedby="intro-help" value={draft().PORTAL_DESCRIPTION} on:input={e => update('PORTAL_DESCRIPTION', e.currentTarget.value)} /></label>
      <p id="intro-help" class="settings-help">{t('Leave the headline or notes blank to hide them. Leave both blank to give more space to your content.')}</p>
      <div class="settings-form-actions"><button type="submit" class="settings-save btn btn-primary">{t('Save changes')}</button><button type="button" id="reset-portal-settings" class="settings-reset btn" onClick={() => { if (!busy()) reset(); }}>{t('Restore defaults')}</button></div>
    </fieldset>;
  }, host);
  return {
    // Read native form values on submit, including browser autofill that did not emit input.
    read, setValues: setDraft, setBusy, busy,
  };
}
