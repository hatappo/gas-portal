import { createMemo, createSignal, For, Show } from 'solid-js';
import { render } from 'solid-js/web';
import { tagPalette } from './tag-palette.js';
import { ToolCard, ToolRow } from './tool-view';
import { ToggleGroup } from '@kobalte/core/toggle-group';
import { SegmentedControl } from '@kobalte/core/segmented-control';
import { Hint } from './ui';
import { SettingsGuidance } from './settings-guidance';

interface CatalogView {
  disabled: boolean;
  notices: {label: string; message: string}[];
  tools: CatalogTool[];
  tags: string[];
  selected: Set<string>;
  issues: CatalogWarning[];
  view: 'cards' | 'list';
  language: string;
  unblocked: string[];
}

// Own only the dynamic lists; the GAS-rendered shell and settings retain their DOM.
export function mountCatalogView(selectTags: (tags: string[]) => void, selectView: (view: 'cards' | 'list') => void) {
  const [state, setState] = createSignal<CatalogView>({ notices: [], disabled: true, tools: [], tags: [], selected: new Set(), issues: [], view: 'cards', language: 'en', unblocked: [] });
  const colors = createMemo(() => new Map(state().tags.map((tag, index) => [tag, tagPalette[index % tagPalette.length]])));
  const tagColor = (tag: string) => colors().get(tag);
  const target = (id: string) => document.getElementById(id)!;
  render(() => <For each={state().view === 'cards' ? state().tools : []}>{(tool) =>
    <ToolCard tool={tool} tagColor={tagColor} language={state().language} unblocked={state().unblocked} />}</For>, target('tools'));
  render(() => <For each={state().view === 'list' ? state().tools : []}>{(tool) =>
    <ToolRow tool={tool} tagColor={tagColor} language={state().language} unblocked={state().unblocked} />}</For>, target('tool-rows'));
  render(() => <Show when={state().tags.length}>
    <button type="button" class="tag-button btn btn-sm" aria-pressed={!state().selected.size} onClick={() => selectTags([])}>
      {PortalI18n.t('All', state().language)}
    </button>
    <ToggleGroup multiple class="tag-options" value={[...state().selected]} onChange={selectTags}
      aria-label={PortalI18n.t('Filter by tags', state().language)}>
      <For each={state().tags}>{(tag) => <ToggleGroup.Item value={tag} class="tag-button btn btn-sm" style={{ "--tag-accent": tagColor(tag) }}>{tag}</ToggleGroup.Item>}</For>
    </ToggleGroup>
  </Show>, target('tags'));

  const switchHost = document.querySelector<HTMLElement>('.view-switch')!;
  const modes = ['cards', 'list'] as const;
  const icons = modes.map((mode) => document.querySelector<HTMLTemplateElement>('#view-' + mode + '-icon')!.content.cloneNode(true));
  switchHost.replaceChildren();
  render(() => <SegmentedControl class="segmented-control join" name="portal-view" orientation="horizontal"
    aria-label={PortalI18n.t('View mode', state().language)} value={state().view} disabled={state().disabled}
    onChange={(value) => { if (value === 'cards' || value === 'list') selectView(value); }}>
    {modes.map((mode, index) => <Hint text={mode === 'cards' ? 'Cards' : 'List'}>{(attributes) =>
      <SegmentedControl.Item as="label" {...attributes} value={mode} class="btn btn-square join-item" classList={{ 'btn-disabled': state().disabled }}>
        <SegmentedControl.ItemInput id={'view-' + mode} aria-label={mode === 'cards' ? 'Cards' : 'List'} aria-describedby={attributes['aria-describedby']} />
        {icons[index]}
      </SegmentedControl.Item>
    }</Hint>)}
  </SegmentedControl>, switchHost);
  render(() => <For each={state().issues}>{(issue) => <li>{issue.row > 0 ?
    PortalI18n.t('Row {row}: {message}', state().language, { row: issue.row, message: PortalI18n.translate(issue.message, state().language) }) :
    PortalI18n.translate(issue.message, state().language)}</li>}</For>, target('warning-list'));
  render(() => <For each={state().notices}>{notice => <p class="action-notice alert alert-warning">
    <Show when={notice.label}><span>{notice.label}: </span></Show><span><SettingsGuidance message={notice.message} language={state().language} /></span>
  </p>}</For>, target('links-notices'));
  return setState;
}
