import { SettingsGuidance } from './settings-guidance';
import { For, Show, createMemo, createSignal, createUniqueId, onCleanup } from 'solid-js';
import { Collapsible } from '@kobalte/core/collapsible';
import { ServiceLogo } from './service-logo';
import { SourceLink } from './source-link';

interface InboxProps {
  groups: InboxGroup[];
  pending: boolean;
  language: string;
  matches: (item: ActionItem) => boolean;
  filtering: boolean;
}

function InboxCard(props: InboxProps) {
  const [expanded, setExpanded] = createSignal(false);
  const [pinned, setPinned] = createSignal(false);
  const id = createUniqueId();
  let timer = 0;
  let card!: HTMLDivElement;
  let trigger!: HTMLButtonElement;
  const t = (key: string) => PortalI18n.t(key, props.language);
  const groups = createMemo(() => props.groups.map(group => ({ ...group, matches: group.items.filter(props.matches) })));
  const items = createMemo(() => groups().flatMap(group => group.matches).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || (a.service + ':' + a.id).localeCompare(b.service + ':' + b.id)));
  const failed = () => props.groups.some(group => group.failed);
  const loaded = () => props.groups.every(group => group.loaded);
  const count = (group: InboxGroup & { matches: ActionItem[] }) => !group.loaded || group.failed && !group.items.length ? '—'
    : String(group.matches.length) + (!props.filtering && (group.hasMore || group.failed) ? '+' : '');
  const empty = () => loaded() && !failed() && !items().length && !props.groups.some(group => group.hasMore);
  const cancel = () => window.clearTimeout(timer);
  const close = () => { cancel(); setPinned(false); setExpanded(false); };
  const enter = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    cancel(); timer = window.setTimeout(() => setExpanded(true), 150);
  };
  const leave = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    cancel(); timer = window.setTimeout(() => {
      if (!pinned() && !card.contains(document.activeElement)) setExpanded(false);
    }, 180);
  };
  document.addEventListener('portal:tabchange', close);
  onCleanup(() => { cancel(); document.removeEventListener('portal:tabchange', close); });
  return <Collapsible class="inbox-card" open={expanded()} forceMount ref={element => { card = element; }} data-empty={empty()} data-error={failed()}
    onPointerEnter={enter} onPointerLeave={leave}
    onFocusOut={event => { if (!pinned() && !card.contains(event.relatedTarget as Node | null)) { cancel(); setExpanded(false); } }}
    onKeyDown={event => { if (event.key === 'Escape' && expanded()) { event.preventDefault(); event.stopPropagation(); close(); trigger.focus({ preventScroll: true }); } }}>
    <button ref={element => { trigger = element; }} type="button" class="inbox-summary" aria-expanded={expanded()} aria-controls={id}
      onClick={() => { cancel(); if (pinned()) close(); else { setPinned(true); setExpanded(true); } }}>
      <span class="inbox-service-counts"><For each={groups()}>{group => <span class="inbox-service" data-service={group.id} data-empty={group.loaded && !group.failed && !group.matches.length} data-error={group.failed}
        title={PortalI18n.t(count(group) === '—' ? '{service}: not retrieved' : '{service}: {count} unread items', props.language, { service: group.label, count: count(group) })}>
        <ServiceLogo service={group.id} label={group.label}/>
        <span class="inbox-count" aria-live="polite" aria-atomic="true">{count(group)}</span>
      </span>}</For></span>
      <span class="inbox-chevron" aria-hidden="true"/>
    </button>
    <Collapsible.Content id={id} class="disclosure-content" inert={!expanded()} aria-hidden={!expanded()}>
      <div class="disclosure-body"><div class="disclosure-inner"><div class="inbox-details">
        <Show when={failed()}><p class="inbox-error" role="alert">{t('Could not retrieve all inbox items.')}</p></Show>
        <Show when={loaded() && !failed() && !items().length}><p class="inbox-empty">{t(props.filtering ? 'No items match your filters.' : 'No unread items.')}</p></Show>
        <ul class="inbox-message-list"><For each={items()}>{item => <li>
          <SourceLink url={item.url} class="inbox-message-title link link-hover">{item.title || t(item.titleFallback || '')}</SourceLink>
          <div class="inbox-message-meta"><ServiceLogo service={item.service} label={item.serviceLabel}/><time dateTime={item.updatedAt}>{new Intl.DateTimeFormat(props.language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(item.updatedAt))}</time><span>{item.context}</span></div>
        </li>}</For></ul>
        <Show when={props.groups.some(group => group.hasMore)}><p class="settings-help inbox-more-results"><SettingsGuidance message="More unread items are available. Increase the limit in Settings to show more." language={props.language}/></p></Show>
      </div></div></div>
    </Collapsible.Content>
  </Collapsible>;
}

export function InboxCards(props: InboxProps) {
  return <Show when={props.groups.length} fallback={<Show when={!props.pending}><p class="inbox-empty"><SettingsGuidance message="Connect an inbox in Settings." language={props.language}/></p></Show>}>
    <InboxCard {...props}/>
  </Show>;
}
