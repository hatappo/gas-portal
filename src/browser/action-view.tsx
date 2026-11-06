import { For, Show, type JSX } from 'solid-js';
import { createStore, reconcile } from 'solid-js/store';
import { render } from 'solid-js/web';
import { Disclosure } from './disclosure';

interface ActionView {
  items: ActionItem[];
  notices: { label: string; notice: ActionNotice }[];
  pending: boolean;
  connected: boolean;
  language: string;
}
const t = (key: string, language: string) => PortalI18n.t(key, language);

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
      <time dateTime={props.item.updatedAt}>{t('Updated', props.language) + ' ' + new Intl.DateTimeFormat(props.language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(props.item.updatedAt))}</time>
    </div>
    <div class="action-item-reasons"><For each={props.item.reasons}>{(reason) => <span class="action-item-kind badge badge-sm badge-ghost">{t(reason, props.language)}</span>}</For></div>
  </li>;
}
export function mountActionView() {
  const [state, setState] = createStore<ActionView>({ items: [], notices: [], pending: true, connected: false, language: 'en' });
  render(() => <Show when={state.notices.length}>
    <Disclosure autoOpen={!state.items.length} title={t('Some results could not be retrieved.', state.language)}><ul>
      <For each={state.notices}>{(entry) => <li>
        <span>{[entry.label, entry.notice.reason && t(entry.notice.reason, state.language), PortalI18n.translate(entry.notice.message, state.language)].filter(Boolean).join(' · ')}</span>
        <Show when={entry.notice.url}>{' '}<SourceLink url={entry.notice.url!}>{t('View source', state.language)}</SourceLink></Show>
      </li>}</For>
    </ul></Disclosure>
  </Show>, document.getElementById('actions-status')!);
  render(() => <Show when={state.items.length} fallback={
    <Show when={!state.pending && !state.notices.length}><div class="status" role="status"><h3>{t('No items to display', state.language)}</h3><p>{t(state.connected ? 'No action items right now.' : 'Connect a service in Settings to see your action items.', state.language)}</p></div></Show>
  }><ul class="action-item-list"><For each={state.items}>{(item) => <ActionRow item={item} language={state.language} />}</For></ul></Show>, document.getElementById('action-items')!);
  // Keep row identity through refreshes and language changes, including IDs shared by services.
  return (snapshot: ActionView) => setState(reconcile({ ...snapshot, items: snapshot.items.map((item) => ({ ...item, key: item.service + ':' + item.id })) }, { key: 'key' }));
}
