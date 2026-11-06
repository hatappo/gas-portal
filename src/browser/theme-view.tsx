import { createSignal, For } from 'solid-js';
import { render } from 'solid-js/web';
import { RadioGroup } from '@kobalte/core/radio-group';
import { useLanguage } from './ui';

export function mountThemePicker(initialTheme: string, onChange: (theme: string) => void) {
  const [theme, setTheme] = createSignal(initialTheme);
  const [busy, setBusy] = createSignal(false);
  const host = document.getElementById('theme-picker')!;
  render(() => {
    const language = useLanguage();
    const t = (key: string) => PortalI18n.t(key, language());
    return <RadioGroup name="portal-theme" value={theme()} disabled={busy()} onChange={onChange}
      aria-labelledby="theme-settings-title" aria-describedby="theme-status">
      <RadioGroup.Item as="label" value="auto" class="theme-choice theme-auto">
        <RadioGroup.ItemInput aria-label={t('Automatic theme')} />
        <span class="theme-auto-swatches" aria-hidden="true"><i data-theme={PortalThemes.auto.light} /><i data-theme={PortalThemes.auto.dark} /></span>
        <span class="theme-auto-copy"><strong>{t('Automatic theme')}</strong><span>{t('Follow your device: Lofi in light mode, Dracula in dark mode.')}</span></span>
        <span class="theme-check" aria-hidden="true">✓</span>
      </RadioGroup.Item>
      <For each={['light', 'dark'] as const}>{(scheme) => <fieldset class="theme-group" data-scheme={scheme}>
        <legend>{t(scheme === 'light' ? 'Light' : 'Dark')}</legend><div class="theme-grid">
          <For each={PortalThemes[scheme]}>{(value) => <RadioGroup.Item as="label" value={value} class="theme-choice">
            <RadioGroup.ItemInput aria-label={PortalThemes.label(value)} />
            <span class="theme-preview" data-theme={value} aria-hidden="true">
              <span class="mini-header"><i /><b /></span><span class="mini-title" />
              <span class="mini-layout"><i /><i /></span><span class="mini-swatches"><i /><i /><i /></span>
            </span>
            <span class="theme-label"><span>{PortalThemes.label(value)}</span><span class="theme-check" aria-hidden="true">✓</span></span>
          </RadioGroup.Item>}</For>
        </div>
      </fieldset>}</For>
    </RadioGroup>;
  }, host);
  return { setTheme, setBusy };
}
