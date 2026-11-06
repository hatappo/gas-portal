import { For, Show, createSignal, splitProps, type JSX } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import { Hint } from './ui';

type Presentation = { language: string; unblocked: string[] };
const t = (key: string, language: string, values = {}) => PortalI18n.t(key, language, values);

// Only origins are sent to the icon service. Private hosts stay on the local network.
export function faviconSources(value: string): string[] {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return [];
    const hostname = url.hostname.replace(/\.$/, '');
    const sources = url.protocol === 'https:' ? [url.origin + '/favicon.ico'] : [];
    const isPrivate = !hostname.includes('.') || hostname.includes(':') || /^[\d.]+$/.test(hostname) ||
      /(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid|onion)$/.test(hostname) || hostname.endsWith('.home.arpa');
    if (!isPrivate) sources.push('https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=64&url=' + encodeURIComponent(url.protocol + '//' + hostname));
    return sources;
  } catch { return []; }
}

function Favicon(props: { url: string; icon?: string; class: string; size: number }) {
  // Each keyed tool owns its image state, so unrelated filter or language changes do not reload it.
  const textIcon = props.icon && !PortalCatalogRules.isIconUrl(props.icon);
  const sources = textIcon ? [] : [...(props.icon ? [props.icon] : []), ...faviconSources(props.url)];
  const [index, setIndex] = createSignal(0);
  const [loaded, setLoaded] = createSignal(false);
  const next = () => { setLoaded(false); setIndex((value) => value + 1); };
  return <span class={[props.class, textIcon ? 'is-text' : '', loaded() ? 'is-loaded' : ''].filter(Boolean).join(' ')} aria-hidden="true">
    <span class={props.class + '-fallback'}>{textIcon ? props.icon : '🌐'}</span>
    <Show when={index() < sources.length}>
      <img width={props.size} height={props.size} alt="" ref={(image) => { image.loading = 'lazy'; image.decoding = 'async'; image.referrerPolicy = 'no-referrer'; }}
        src={sources[index()]} on:error={next} on:load={(event) => {
          const image = event.currentTarget;
          if (image.naturalWidth > 0 && (image.naturalWidth < 8 || image.naturalHeight < 8)) next();
          else setLoaded(true);
        }} />
    </Show>
  </span>;
}

function Tags(props: { tool: CatalogTool }) {
  return <div class="tool-tags" hidden={!props.tool.tags.length}>
    <For each={props.tool.tags}>{(tag) => <span class="tool-tag badge badge-sm">{tag}</span>}</For>
  </div>;
}
function BlockedUrl(props: { url: string; language: string }) {
  return <span class="blocked-url"><span class="blocked-url-label badge badge-xs badge-outline">{t('Blocked scheme', props.language)}</span><span class="blocked-url-text">{props.url}</span></span>;
}
function ToolLink(props: Presentation & JSX.HTMLAttributes<HTMLElement> & { url: string; description?: string; children: JSX.Element }) {
  const [, attributes] = splitProps(props, ['url', 'class', 'description', 'children', 'language', 'unblocked']);
  const blocked = () => PortalUrlSchemes.isBlocked(props.url, props.unblocked);
  return <Dynamic {...attributes} component={blocked() ? 'span' : 'a'} class={[props.class, blocked() ? 'is-blocked' : ''].filter(Boolean).join(' ')}
    href={blocked() ? undefined : props.url} target={blocked() ? undefined : '_blank'} rel={blocked() ? undefined : 'noopener noreferrer'}
    aria-disabled={blocked() ? true : undefined} aria-description={props.description || undefined}
    title={blocked() ? t('Blocked link: {url}', props.language, { url: props.url }) : undefined}>
    {props.children}<Show when={!blocked()}><span class="visually-hidden">{t('(opens in a new tab)', props.language)}</span></Show>
  </Dynamic>;
}
function RelatedLinks(props: Presentation & { tool: CatalogTool; tooltipLeft?: boolean }) {
  return <ul class="related-links" aria-label={t('Related links for {name}', props.language, { name: props.tool.name })}>
    <For each={props.tool.children}>{(child) => {
      const link = (attributes: JSX.HTMLAttributes<HTMLElement> = {}) =>
        <ToolLink {...attributes} url={child.url} language={props.language} unblocked={props.unblocked} description={child.description}>
          <Show when={!PortalUrlSchemes.isBlocked(child.url, props.unblocked)}><Favicon url={child.url} icon={child.icon} class="related-favicon" size={14} /></Show>
          <span class="related-label">{child.name}</span>
          <Show when={PortalUrlSchemes.isBlocked(child.url, props.unblocked)}><BlockedUrl url={child.url} language={props.language} /></Show>
        </ToolLink>;
      return <li><Show when={child.description} fallback={link()}>
        <Hint text={child.description} placement={props.tooltipLeft ? 'left' : 'top'}>{link}</Hint>
      </Show></li>;
    }}</For>
  </ul>;
}
export function ToolCard(props: Presentation & { tool: CatalogTool }) {
  const blocked = () => PortalUrlSchemes.isBlocked(props.tool.url, props.unblocked);
  return <li><article class="tool-card card card-border bg-base-100" classList={{ 'is-blocked': blocked() }}>
    <ToolLink url={props.tool.url} language={props.language} unblocked={props.unblocked} class="tool-main">
      <h3><Favicon url={props.tool.url} icon={props.tool.icon} class="tool-favicon" size={20} /><span>{props.tool.name}</span></h3>
      <p class="tool-description">{props.tool.description}</p>
      <Show when={blocked()}><BlockedUrl url={props.tool.url} language={props.language} /></Show>
      <Tags tool={props.tool} />
    </ToolLink>
    <Show when={props.tool.children?.length}><RelatedLinks tool={props.tool} language={props.language} unblocked={props.unblocked} /></Show>
  </article></li>;
}
export function ToolRow(props: Presentation & { tool: CatalogTool }) {
  return <tr><th scope="row">
    <ToolLink url={props.tool.url} language={props.language} unblocked={props.unblocked} class="tool-name-link">
      <Favicon url={props.tool.url} icon={props.tool.icon} class="tool-favicon" size={20} /><span>{props.tool.name}</span>
    </ToolLink>
    <Show when={PortalUrlSchemes.isBlocked(props.tool.url, props.unblocked)}><BlockedUrl url={props.tool.url} language={props.language} /></Show>
  </th><td>{props.tool.description || '—'}</td><td><Tags tool={props.tool} /></td><td>
    <Show when={props.tool.children?.length} fallback="—"><RelatedLinks tool={props.tool} language={props.language} unblocked={props.unblocked} tooltipLeft /></Show>
  </td></tr>;
}
