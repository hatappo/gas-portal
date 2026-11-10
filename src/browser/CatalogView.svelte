<script lang="ts">
  import { SegmentedControl, ToggleGroup } from '@skeletonlabs/skeleton-svelte';
  import Tool from './Tool.svelte';
  import Hint from './Hint.svelte';
  import Icon from './Icon.svelte';
  import SettingsGuidance from './SettingsGuidance.svelte';
  import { tagPalette } from './tag-palette.js';
  import type { HTMLAttributes } from 'svelte/elements';
  import type { Cell } from './view';
  import type { CatalogView } from './catalog-view';
  let {
    state,
    part,
    selectTags,
    selectView,
  }: {
    state: Cell<CatalogView>;
    part: string;
    selectTags: (tags: string[]) => void;
    selectView: (view: 'cards' | 'list') => void;
  } = $props();
  let colors = $derived(
    new Map($state.tags.map((tag, index) => [tag, tagPalette[index % tagPalette.length]])),
  );
  // Keep the radio item's anatomy and selection state when composing a tooltip trigger.
  const tooltipAttributes = (attributes: HTMLAttributes<HTMLElement>) =>
    Object.fromEntries(Object.entries(attributes).filter(([name]) =>
      !['data-scope', 'data-part', 'data-state', 'data-ownedby'].includes(name)));
  const tagColor = (tag: string) => colors.get(tag);
  const t = (key: string) => PortalI18n.t(key, $state.language);
</script>

{#if part === 'cards' || part === 'list'}
  {#each $state.view === part ? $state.tools : [] as tool (tool.id)}<Tool
      {tool}
      {tagColor}
      language={$state.language}
      unblocked={$state.unblocked}
      row={part === 'list'}
    />{/each}
{:else if part === 'tags'}
  {#if $state.tags.length}<button
      type="button"
      class="tag-button btn btn-sm"
      aria-pressed={!$state.selected.size}
      onclick={() => selectTags([])}
    >
      {t('All')}
    </button>
    <ToggleGroup
      multiple
      class="tag-options"
      value={[...$state.selected]}
      onValueChange={({ value }) => selectTags(value)}
      aria-label={t('Filter by tags')}
    >
      {#each $state.tags as tag}<ToggleGroup.Item
          value={tag}
          class="tag-button btn btn-sm"
          style={'--tag-accent: ' + tagColor(tag)}
        >
          {tag}
        </ToggleGroup.Item>{/each}
    </ToggleGroup>{/if}
{:else if part === 'view'}
  <SegmentedControl
    class="segmented-control"
    name="portal-view"
    ids={{ itemHiddenInput: (value) => 'view-' + value, item: (value) => 'view-' + value + '-label' }}
    orientation="horizontal"
    aria-label={t('View mode')}
    value={$state.view}
    disabled={$state.disabled}
    onValueChange={({ value }) => {
      if (value === 'cards' || value === 'list') selectView(value);
    }}
  >
    <SegmentedControl.Control>
      <SegmentedControl.Indicator />
      {#each ['cards', 'list'] as mode}<Hint text={mode === 'cards' ? 'Cards' : 'List'} triggerId={'view-' + mode + '-label'}>
          {#snippet children(attributes)}
            <SegmentedControl.Item
              {...tooltipAttributes(attributes)}
              value={mode}
            >
              <SegmentedControl.ItemHiddenInput
                aria-label={mode === 'cards' ? 'Cards' : 'List'}
              />
              <SegmentedControl.ItemText>
                <Icon id={'view-' + mode + '-icon'} />
                <span class="sr-only">{mode === 'cards' ? 'Cards' : 'List'}</span>
              </SegmentedControl.ItemText>
            </SegmentedControl.Item>{/snippet}
        </Hint>{/each}
    </SegmentedControl.Control>
  </SegmentedControl>
{:else if part === 'issues'}
  {#each $state.issues as issue}<li>
      {issue.row > 0
        ? PortalI18n.t('Row {row}: {message}', $state.language, {
            row: issue.row,
            message: PortalI18n.translate(issue.message, $state.language),
          })
        : PortalI18n.translate(issue.message, $state.language)}
    </li>{/each}
{:else if part === 'notices'}
  {#each $state.notices as notice}<p class="action-notice alert portal-alert-warning">
      {#if notice.label}<span>{notice.label}:</span>{/if}
      <span><SettingsGuidance message={notice.message} language={$state.language} /></span>
    </p>{/each}
{/if}
