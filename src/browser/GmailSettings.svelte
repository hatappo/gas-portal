<script lang="ts">
  import { Switch } from '@skeletonlabs/skeleton-svelte';
  import ServiceLogo from './ServiceLogo.svelte';
  import Icon from './Icon.svelte';
  import type { Cell } from './view';
  let {
    language,
    draft,
    setDraft,
    initialized,
    busy,
    error,
    saved,
    save,
    initialize,
  }: {
    language: Cell<string>;
    draft: Cell<GmailSettings>;
    setDraft: (value: GmailSettings) => void;
    initialized: Cell<boolean>;
    busy: Cell<boolean>;
    error: Cell<string>;
    saved: Cell<boolean>;
    save: () => Promise<void>;
    initialize: () => Promise<void>;
  } = $props();
  const t = (key: string) => PortalI18n.t(key, $language);
</script>

<div class="settings-heading">
  <h2 id="gmail-settings-title"><ServiceLogo service="gmail" label="Gmail" decorative />Gmail</h2>
  <p>
    {t(
      'Show unread mail in the Inbox section of Inbox & Tasks using the Google account running this app. Read or reply in Gmail.',
    )}
  </p>
</div>
<p class="settings-help">
  {t(
    'Only subjects, senders, labels and dates are read. Bodies and attachments are not accessed. Spam and trash are excluded; archived unread mail is included.',
  )}
</p>
{#if $busy}<div
    class="refresh-catalog actions-loading"
    role="status"
    aria-label={t('Loading…')}
    aria-busy="true"
  >
    <Icon id="gmail-refresh-icon" />
  </div>{/if}
<form
  id="gmail-settings-form"
  onsubmit={(event) => {
    event.preventDefault();
    void save();
  }}
>
  <fieldset disabled={$busy || !$initialized}>
    <Switch
      class="gmail-enabled"
      ids={{ hiddenInput: 'gmail-enabled' }}
      checked={$draft.enabled}
      disabled={$busy || !$initialized}
      onCheckedChange={({ checked }) => setDraft({ ...$draft, enabled: checked })}
    >
      <Switch.Control><Switch.Thumb /></Switch.Control>
      <Switch.HiddenInput />
      <Switch.Label>{t('Show unread Gmail in Inbox')}</Switch.Label>
    </Switch>
    <label class="settings-field">
      <span id="gmail-limit-label">{t('Maximum unread messages')}</span>
      <select
        id="gmail-limit"
        aria-labelledby="gmail-limit-label"
        class="select"
        value={$draft.limit}
        onchange={(event) => setDraft({ ...$draft, limit: Number(event.currentTarget.value) })}
      >
        {#each PortalGmail.limits as limit}<option value={limit}>{limit}</option>{/each}
      </select>
    </label>
    <p class="settings-help">
      {t(
        '20 by default. Shows a preview of unread messages; a + indicates more. Uses the shared Inbox & Tasks cache.',
      )}
    </p>
    <button type="submit" class="btn preset-filled-primary-500">{t('Save changes')}</button>
  </fieldset>
</form>
{#if $error}<p class="gmail-status alert portal-alert-error portal-alert-soft" role="alert">
    {t($error)}
  </p>{/if}
{#if $saved && !$error}<p class="settings-form-status" role="status">{t('Saved')}</p>{/if}
{#if !$initialized && $error}<button
    type="button"
    class="btn button-quiet btn-sm"
    disabled={$busy}
    onclick={() => void initialize()}
  >
    {t('Try again')}
  </button>{/if}
