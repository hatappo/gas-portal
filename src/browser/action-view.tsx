import { For, Show, createMemo, createSignal, createEffect, type JSX } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { render } from 'solid-js/web';
import { formatListCount } from './list-presentation.js';
import { Disclosure } from './disclosure';
import { ToggleGroup } from '@kobalte/core/toggle-group';

interface ActionView {
  items: ActionItem[];
  notices: { label: string; notice: ActionNotice }[];
  moreSources: string[];
  pending: boolean;
  hasResults: boolean;
  connected: boolean;
  language: string;
}
const t = (key: string, language: string) => PortalI18n.t(key, language);

interface ActionType { id: string; service: string; serviceLabel: string; reason: string }
const typeId = (service: string, reason: string) => encodeURIComponent(JSON.stringify([service, reason]));
const typeLabel = (service: string, reason: string, language: string) => service + ' ' + t(reason, language);
// Stable category hues are blended into the current theme by the shared tag styles.
function typeColor(service: string, reason: string) {
  const colors: Record<string, string> = {
    'Assigned issue': '#1d4ed8', 'Direct review': '#0f766e',
    'Team review': '#6d28d9', 'Changes requested': '#92400e',
  };
  return service === 'github' ? colors[reason] || '#475569' : service === 'slack' ? '#9d174d' : '#475569';
}

function SourceLink(props: { url: string; class?: string; children: JSX.Element }) {
  const href = () => {
    try {
      const url = new URL(props.url);
      if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
    } catch { /* Invalid destinations stay inert. */ }
    return undefined;
  };
  const icon = document.querySelector<HTMLTemplateElement>('#action-external-icon')!.content.cloneNode(true);
  return <a href={href()} target={href() ? '_blank' : undefined} rel={href() ? 'noopener noreferrer' : undefined} class={props.class}>{props.children}{icon}</a>;
}
function ActionRow(props: { item: ActionItem; language: string }) {
  return <li>
    <SourceLink url={props.item.url} class="action-item-title link link-hover">{props.item.title}</SourceLink>
    <div class="action-item-meta"><span class="action-service">{props.item.serviceLabel}</span><span class="action-context">{props.item.context}</span>
      <time dateTime={props.item.updatedAt}>{t(props.item.dateLabel || 'Updated', props.language) + ' ' + new Intl.DateTimeFormat(props.language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(props.item.updatedAt))}</time>
    </div>
    <div class="action-item-reasons"><For each={props.item.reasons}>{(reason) => <span class="action-item-kind badge badge-sm" style={{ "--tag-accent": typeColor(props.item.service, reason) }}>{typeLabel(props.item.serviceLabel, reason, props.language)}</span>}</For></div>
  </li>;
}
export function mountActionView() {
  const [state, setState] = createStore<ActionView>({ items: [], notices: [], moreSources: [], pending: true, hasResults: false, connected: false, language: 'en' });
  // Keep selected types available even if a refresh removes their last matching item.
  const [selected, setSelected] = createSignal<ActionType[]>([]);
  const types = createMemo(() => {
    const choices = new Map<string, ActionType>();
    for (const item of state.items) for (const reason of item.reasons) {
      const id = typeId(item.service, reason);
      choices.set(id, { id, service: item.service, serviceLabel: item.serviceLabel, reason });
    }
    for (const choice of selected()) if (!choices.has(choice.id)) choices.set(choice.id, choice);
    return [...choices.values()].sort((a, b) => a.id.localeCompare(b.id));
  });
  const filtered = createMemo(() => {
    const ids = new Set(selected().map(choice => choice.id));
    return ids.size ? state.items.filter(item => item.reasons.some(reason => ids.has(typeId(item.service, reason)))) : state.items;
  });
  render(() => <Show when={types().length}><div class="tag-filter action-type-filter">
    <div class="tag-heading" title={t('Filter by type (match any)', state.language)}>Types</div>
    <div class="tags">
      <button type="button" class="tag-button btn btn-sm" aria-pressed={!selected().length} onClick={() => setSelected([])}>{t('All', state.language)}</button>
      <ToggleGroup multiple class="tag-options" value={selected().map(choice => choice.id)}
        onChange={ids => setSelected(types().filter(choice => ids.includes(choice.id)))}
        aria-label={t('Filter by type (match any)', state.language)}>
        <For each={types().map(choice => choice.id)}>{id => {
          const choice = () => types().find(choice => choice.id === id)!;
          return <ToggleGroup.Item value={id} class="tag-button action-type-button btn btn-sm"
            style={{ "--tag-accent": typeColor(choice().service, choice().reason) }}>{typeLabel(choice().serviceLabel, choice().reason, state.language)}</ToggleGroup.Item>;
        }}</For>
      </ToggleGroup>
    </div>
  </div></Show>, document.getElementById('action-filters')!);
  const countHost = document.getElementById('actions-count')!;
  countHost.replaceChildren();
  createEffect(() => countHost.style.setProperty('--count-digits', String(String(state.items.length).length)));
  render(() => <>{state.hasResults || !state.pending ? formatListCount(filtered().length, state.items.length, state.language) : '—'}</>, countHost);
  render(() => <Show when={state.notices.length}>
    <Disclosure autoOpen={!state.items.length} title={t('Some results could not be retrieved.', state.language)}><ul>
      <For each={state.notices}>{(entry) => <li>
        <span>{[entry.label, entry.notice.reason && t(entry.notice.reason, state.language), PortalI18n.translate(entry.notice.message, state.language)].filter(Boolean).join(' · ')}</span>
        <Show when={entry.notice.url}>{' '}<SourceLink url={entry.notice.url!}>{t('View source', state.language)}</SourceLink></Show>
      </li>}</For>
    </ul></Disclosure>
  </Show>, document.getElementById('actions-status')!);
  render(() => <><Show when={filtered().length} fallback={
    <Show when={!state.pending && !state.notices.length}><div class="status" role="status"><h3>{t('No items to display', state.language)}</h3><p>{t(selected().length ? 'No items match the selected types.' : state.connected ? 'No action items right now.' : 'Connect a service in Settings to see your action items.', state.language)}</p><Show when={selected().length}><button type="button" class="reset-button btn btn-sm" onClick={() => setSelected([])}>{t('Clear filters', state.language)}</button></Show></div></Show>
  }><ul class="action-item-list"><For each={filtered()}>{(item) => <ActionRow item={item} language={state.language} />}</For></ul></Show>
    <For each={state.moreSources}>{(source) => <p class="settings-help action-more-results">{source + ' · ' + t('More search results are available. Increase the limit in Settings to show more.', state.language)}</p>}</For>
  </>, document.getElementById('action-items')!);
  // Keep row identity through refreshes and language changes, including IDs shared by services.
  return (snapshot: ActionView) => setState(reconcile({ ...snapshot, items: snapshot.items.map((item) => ({ ...item, key: item.service + ':' + item.id })) }, { key: 'key' }));
}
