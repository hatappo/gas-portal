import { SettingsGuidance } from './settings-guidance';
import { For, Show, createMemo, createSignal, createEffect } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { render } from 'solid-js/web';
import { InboxCards } from './inbox-view';
import { SourceLink } from './source-link';
import { ServiceLogo } from './service-logo';
import { tagPalette } from './tag-palette.js';
import { formatListCount } from './list-presentation.js';
import { Disclosure } from './disclosure';
import { ActionDiagnostics } from './action-diagnostics';

interface ActionView {
  diagnostics: ActionDiagnostic[];
  inboxes: InboxGroup[];
  items: ActionItem[];
  notices: { label: string; notice: ActionNotice }[];
  moreSources: string[];
  pending: boolean;
  hasResults: boolean;
  connected: boolean;
  language: string;
}
const t = (key: string, language: string) => PortalI18n.t(key, language);

const typeLabel = (service: string, reason: string, language: string) => service + ' ' + t(reason, language);
// Stable category hues are blended into the current theme by the shared tag styles.
function typeColor(service: string, reason: string) {
  const colors: Record<string, string> = {
    'Assigned issue': tagPalette[0], 'Direct review': tagPalette[1],
    'Team review': tagPalette[2], 'Changes requested': tagPalette[3],
  };
  return service === 'github' ? colors[reason] || tagPalette[5] : service === 'slack' ? tagPalette[4] : tagPalette[5];
}

function ActionRow(props: { item: ActionItem; language: string }) {
  return <li>
    <SourceLink url={props.item.url} class="action-item-title link link-hover">{props.item.title || t(props.item.titleFallback || '', props.language)}</SourceLink>
    <div class="action-item-meta"><span class="action-service"><ServiceLogo service={props.item.service} label={props.item.serviceLabel}/></span>
      <time dateTime={props.item.updatedAt}>{t(props.item.dateLabel || 'Updated', props.language) + ' ' + new Intl.DateTimeFormat(props.language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(props.item.updatedAt))}</time><span class="action-context">{props.item.context}</span>
    </div>
    <div class="action-item-reasons"><For each={props.item.reasons}>{(reason) => <span class="action-item-kind badge badge-sm" style={{ "--tag-accent": typeColor(props.item.service, reason) }}>{typeLabel(props.item.serviceLabel, reason, props.language)}</span>}</For></div>
  </li>;
}
export function mountActionView() {
  const [state, setState] = createStore<ActionView>({ diagnostics: [], inboxes: [], items: [], notices: [], moreSources: [], pending: true, hasResults: false, connected: false, language: 'en' });
  const search = document.getElementById('actions-search') as HTMLInputElement;
  const [query, setQuery] = createSignal('');
  const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase('ja').trim();
  search.addEventListener('input', () => setQuery(normalize(search.value)));
  const matches = (item: ActionItem) => normalize([item.title || t(item.titleFallback || '', state.language), item.context].join(' ')).includes(query());
  render(() => <InboxCards groups={state.inboxes} pending={state.pending} language={state.language} matches={matches} filtering={!!query()}/>, document.getElementById('inbox-services')!);
  const clearFilters = () => { search.value = ''; setQuery(''); search.focus(); };
  const hasFilters = () => query().length > 0;
  const filtered = createMemo(() => state.items.filter(matches));
  const inboxItems = createMemo(() => state.inboxes.flatMap(group => group.items));
  const inboxCountHost = document.getElementById('inbox-total-count')!;
  inboxCountHost.replaceChildren();
  createEffect(() => inboxCountHost.style.setProperty('--count-digits', String(String(inboxItems().length).length)));
  render(() => <>{(state.hasResults || !state.pending) && state.inboxes.every(group => group.loaded && (!group.failed || group.items.length > 0))
    ? formatListCount(inboxItems().filter(matches).length, inboxItems().length, state.language) : '—'}</>, inboxCountHost);
  const countHost = document.getElementById('actions-count')!;
  countHost.replaceChildren();
  createEffect(() => countHost.style.setProperty('--count-digits', String(String(state.items.length).length)));
  render(() => <>{state.hasResults || !state.pending ? formatListCount(filtered().length, state.items.length, state.language) : '—'}</>, countHost);
  render(() => <Show when={state.notices.length}>
    <Disclosure autoOpen={!state.items.length} title={t('Some results could not be retrieved.', state.language)}><ul>
      <For each={state.notices}>{(entry) => <li>
        <span>{[entry.label, entry.notice.reason && t(entry.notice.reason, state.language)].filter(Boolean).map(part => part + ' · ')}<SettingsGuidance message={entry.notice.message} language={state.language}/></span>
        <Show when={entry.notice.url}>{' '}<SourceLink url={entry.notice.url!}>{t('View source', state.language)}</SourceLink></Show>
      </li>}</For>
    </ul></Disclosure>
  </Show>, document.getElementById('actions-status')!);
  render(() => <><Show when={filtered().length} fallback={
    <Show when={!state.pending && !state.notices.length}><div class="status" role="status"><h3>{t('No items to display', state.language)}</h3><p><SettingsGuidance message={hasFilters() ? 'No items match your filters.' : state.connected ? (state.moreSources.length ? 'No tasks in the checked results.' : 'No tasks right now.') : 'Connect a task service in Settings.'} language={state.language}/></p><Show when={hasFilters()}><button type="button" class="reset-button btn btn-sm" onClick={clearFilters}>{t('Clear filters', state.language)}</button></Show></div></Show>
  }><ul class="action-item-list"><For each={filtered()}>{(item) => <ActionRow item={item} language={state.language} />}</For></ul></Show>
    <For each={state.moreSources}>{(source) => <p class="settings-help action-more-results">{source + ' · '}<SettingsGuidance message="The 200-item check limit was reached. Older results have not been checked." language={state.language}/></p>}</For>
  </>, document.getElementById('action-items')!);
  render(() => <ActionDiagnostics entries={state.diagnostics} language={state.language}/>, document.getElementById('action-diagnostics')!);
  // Keep row identity through refreshes and language changes, including IDs shared by services.
  return (snapshot: ActionView) => setState(reconcile({ ...snapshot, inboxes: snapshot.inboxes.map(group => ({ ...group, key: 'inbox:' + group.id, items: group.items.map(item => ({ ...item, key: item.service + ':' + item.id })) })), items: snapshot.items.map((item) => ({ ...item, key: item.service + ':' + item.id })) }, { key: 'key' }));
}
