<script lang="ts">
  import { language } from './language-store';
  import type { Cell } from './view';
  let {
    draft,
    busy,
    update,
    reset,
  }: {
    draft: Cell<PortalSettings>;
    busy: Cell<boolean>;
    update: (key: keyof PortalSettings, value: string) => void;
    reset: () => void;
  } = $props();
  const t = (key: string) => PortalI18n.t(key, $language);
  // Do not truncate an IME composition. The caret identifies the newly typed character.
  function updateIcon(input: HTMLInputElement, composing = false) {
    if (!composing) {
      const chars = (text: string) =>
        Array.from(text.normalize('NFC')).filter((char) => char.trim());
      const all = chars(input.value);
      if (all.length > 1 || input.value !== input.value.normalize('NFC').trim()) {
        const typed = chars(input.value.slice(0, input.selectionEnd ?? input.value.length));
        input.value = typed[typed.length - 1] ?? all[0] ?? '';
      }
    }
    update('PORTAL_ICON', input.value);
  }
</script>

<fieldset id="portal-settings-fields" disabled={$busy}>
  <legend class="visually-hidden">{t('Portal display settings')}</legend>
  <div class="settings-fields-row">
    <label class="settings-field">
      <span>{t('Portal name')}</span>
      <input
        id="setting-name"
        class="input w-full"
        name="PORTAL_NAME"
        maxlength={80}
        autocomplete="off"
        value={$draft.PORTAL_NAME}
        oninput={(event) => update('PORTAL_NAME', event.currentTarget.value)}
      />
    </label>
    <label class="settings-field settings-icon-field">
      <span>{t('Icon')}</span>
      <input
        id="setting-icon"
        class="input w-full"
        name="PORTAL_ICON"
        maxlength={8}
        autocomplete="off"
        aria-describedby="icon-help"
        value={$draft.PORTAL_ICON}
        oninput={(event) =>
          updateIcon(event.currentTarget, 'isComposing' in event && event.isComposing === true)}
        oncompositionend={(event) => updateIcon(event.currentTarget)}
      />
      <span id="icon-help">{t('1 character')}</span>
    </label>
  </div>
  <label class="settings-field">
    <span>{t('Headline')}</span>
    <input
      id="setting-headline"
      class="input w-full"
      name="PORTAL_HEADLINE"
      maxlength={160}
      autocomplete="off"
      aria-describedby="intro-help"
      value={$draft.PORTAL_HEADLINE}
      oninput={(event) => update('PORTAL_HEADLINE', event.currentTarget.value)}
    />
  </label>
  <label class="settings-field">
    <span>{t('Notes')}</span>
    <textarea
      id="setting-description"
      class="textarea w-full"
      name="PORTAL_DESCRIPTION"
      maxlength={500}
      rows={3}
      aria-describedby="intro-help"
      value={$draft.PORTAL_DESCRIPTION}
      oninput={(event) => update('PORTAL_DESCRIPTION', event.currentTarget.value)}></textarea>
  </label>
  <p id="intro-help" class="settings-help">
    {t(
      'Leave the headline or notes blank to hide them. Leave both blank to give more space to your content.',
    )}
  </p>
  <div class="settings-form-actions">
    <button type="submit" class="settings-save btn preset-filled-primary-500">
      {t('Save changes')}
    </button>
    <button
      type="button"
      id="reset-portal-settings"
      class="settings-reset btn"
      onclick={() => {
        if (!$busy) reset();
      }}
    >
      {t('Restore defaults')}
    </button>
  </div>
</fieldset>
