<script lang="ts">
  import { SegmentedControl } from '@skeletonlabs/skeleton-svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import Hint from './Hint.svelte';
  import Icon from './Icon.svelte';
  import { language } from './language-store';
  import type { Cell } from './view';

  let {
    theme,
    busy,
    onChange,
  }: {
    theme: Cell<string>;
    busy: Cell<boolean>;
    onChange: (theme: string) => void;
  } = $props();
  const t = (key: string) => PortalI18n.t(key, $language);
  const selection = $derived(PortalThemes.resolve($theme));
  const modes = [
    { value: 'auto', label: 'Automatic', icon: 'sun-moon' },
    { value: 'light', label: 'Light', icon: 'sun' },
    { value: 'dark', label: 'Dark', icon: 'moon' },
  ];
  // Keep Skeleton's radio attributes when composing the tooltip trigger.
  const tooltipAttributes = (attributes: HTMLAttributes<HTMLElement>) =>
    Object.fromEntries(Object.entries(attributes).filter(([name]) =>
      !['data-scope', 'data-part', 'data-state', 'data-ownedby'].includes(name)));
</script>

<div class="theme-mode">
  <span id="theme-mode-label">{t('Color scheme')}</span>
  <SegmentedControl
    class="segmented-control theme-mode-switch"
    ids={{ item: value => 'theme-mode-' + value }}
    name="portal-color-scheme"
    aria-labelledby="theme-mode-label"
    value={selection.scheme}
    disabled={$busy}
    onValueChange={({ value }) => {
      if (value) onChange(PortalThemes.preference(selection.palette, value));
    }}
  >
    <SegmentedControl.Control>
      <SegmentedControl.Indicator />
      {#each modes as mode}
        <Hint text={t(mode.label)} triggerId={'theme-mode-' + mode.value}>
          {#snippet children(attributes)}<SegmentedControl.Item {...tooltipAttributes(attributes)} value={mode.value}>
            <SegmentedControl.ItemHiddenInput aria-label={t(mode.label)} />
            <SegmentedControl.ItemText>
              <Icon id={'theme-' + mode.icon + '-icon'} />
              <span class="sr-only">{t(mode.label)}</span>
            </SegmentedControl.ItemText>
          </SegmentedControl.Item>{/snippet}
        </Hint>
      {/each}
    </SegmentedControl.Control>
  </SegmentedControl>
  <p class="settings-help">{t('Follow your device’s light or dark appearance.')}</p>
</div>
<SegmentedControl
  class="theme-grid"
  name="portal-theme"
  value={selection.palette}
  disabled={$busy}
  onValueChange={({ value }) => {
    if (value) onChange(PortalThemes.preference(value, selection.scheme));
  }}
  aria-labelledby="theme-settings-title"
  aria-describedby="theme-status"
>
  {#each PortalThemes.palettes as palette}
    <SegmentedControl.Item value={palette} class="theme-choice">
      <SegmentedControl.ItemHiddenInput aria-label={PortalThemes.label(palette)} />
      <span
        class="theme-preview"
        data-theme={palette}
        data-color-scheme={selection.scheme}
        aria-hidden="true"
      >
        <span class="mini-header">
          <i></i>
          <b></b>
        </span>
        <span class="mini-title"></span>
        <span class="mini-layout">
          <i></i>
          <i></i>
        </span>
        <span class="mini-swatches">
          <i></i>
          <i></i>
          <i></i>
        </span>
      </span>
      <span class="theme-label">
        <span>{PortalThemes.label(palette)}</span>
        <span class="theme-check" aria-hidden="true">✓</span>
      </span>
    </SegmentedControl.Item>
  {/each}
</SegmentedControl>
