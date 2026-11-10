<script lang="ts">
  import { Collapsible } from '@skeletonlabs/skeleton-svelte';
  import { onMount } from 'svelte';
  import SettingsGuidance from './SettingsGuidance.svelte';
  import SourceLink from './SourceLink.svelte';
  import ServiceLogo from './ServiceLogo.svelte';
  let {
    groups: sources,
    pending,
    language,
    matches,
    filtering,
  }: {
    groups: InboxGroup[];
    pending: boolean;
    language: string;
    matches: (item: ActionItem) => boolean;
    filtering: boolean;
  } = $props();
  let expanded = $state(false);
  let pinned = $state(false);
  const id = $props.id();
  let timer: ReturnType<typeof setTimeout>;
  let card = $state<HTMLDivElement>(null!);
  let trigger = $state<HTMLButtonElement>(null!);
  const t = (key: string) => PortalI18n.t(key, language);
  let groups = $derived(
    sources.map((group) => ({ ...group, matches: group.items.filter(matches) })),
  );
  let items = $derived(
    groups
      .flatMap((group) => group.matches)
      .sort(
        (a, b) =>
          Date.parse(b.updatedAt) - Date.parse(a.updatedAt) ||
          (a.service + ':' + a.id).localeCompare(b.service + ':' + b.id),
      ),
  );
  let failed = $derived(sources.some((group) => group.failed));
  let loaded = $derived(sources.every((group) => group.loaded));
  const count = (group: InboxGroup & { matches: ActionItem[] }) =>
    !group.loaded || (group.failed && !group.items.length)
      ? '—'
      : String(group.matches.length) + (!filtering && (group.hasMore || group.failed) ? '+' : '');
  let empty = $derived(
    loaded && !failed && !items.length && !sources.some((group) => group.hasMore),
  );
  const cancel = () => clearTimeout(timer);
  const close = () => {
    cancel();
    pinned = false;
    expanded = false;
  };
  const enter = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    cancel();
    timer = setTimeout(() => (expanded = true), 150);
  };
  const leave = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    cancel();
    timer = setTimeout(() => {
      if (!pinned && !card.contains(document.activeElement)) expanded = false;
    }, 180);
  };
  onMount(() => {
    document.addEventListener('portal:tabchange', close);
    return () => {
      cancel();
      document.removeEventListener('portal:tabchange', close);
    };
  });
</script>

{#if sources.length}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={card}
    style="display: contents"
    onpointerenter={enter}
    onpointerleave={leave}
    onfocusout={(event) => {
      if (!pinned && !card.contains(event.relatedTarget as Node | null)) {
        cancel();
        expanded = false;
      }
    }}
    onkeydown={(event) => {
      if (event.key === 'Escape' && expanded) {
        event.preventDefault();
        event.stopPropagation();
        close();
        trigger.focus({ preventScroll: true });
      }
    }}
  >
    <Collapsible class="inbox-card" open={expanded} data-empty={empty} data-error={failed}>
      <button
        bind:this={trigger}
        type="button"
        class="inbox-summary"
        aria-expanded={expanded}
        aria-controls={id}
        onclick={() => {
          cancel();
          if (pinned) close();
          else {
            pinned = true;
            expanded = true;
          }
        }}
      >
        <span class="inbox-service-counts">
          {#each groups as group (group.id)}<span
              class="inbox-service"
              data-service={group.id}
              data-empty={group.loaded && !group.failed && !group.matches.length}
              data-error={group.failed}
              title={PortalI18n.t(
                count(group) === '—'
                  ? '{service}: not retrieved'
                  : '{service}: {count} unread items',
                language,
                { service: group.label, count: count(group) },
              )}
            >
              <ServiceLogo service={group.id} label={group.label} />
              <span class="inbox-count" aria-live="polite" aria-atomic="true">{count(group)}</span>
            </span>{/each}
        </span>
        <span class="inbox-chevron" aria-hidden="true"></span>
      </button>
      <Collapsible.Content
        {id}
        class="portal-disclosure-content"
        hidden={false}
        inert={expanded ? undefined : true}
        data-state={expanded ? 'open' : 'closed'}
        aria-hidden={!expanded}
      >
        <div class="disclosure-body">
          <div class="disclosure-inner">
            <div class="inbox-details">
              {#if failed}<p class="inbox-error" role="alert">
                  {t('Could not retrieve all inbox items.')}
                </p>{/if}
              {#if loaded && !failed && !items.length}<p class="inbox-empty">
                  {t(filtering ? 'No items match your filters.' : 'No unread items.')}
                </p>{/if}
              <ul class="inbox-message-list">
                {#each items as item (item.service + ':' + item.id)}<li>
                    <SourceLink url={item.url} class="inbox-message-title link link-hover">
                      {item.title || t(item.titleFallback || '')}
                    </SourceLink>
                    <div class="inbox-message-meta">
                      <ServiceLogo service={item.service} label={item.serviceLabel} />
                      <time datetime={item.updatedAt}>
                        {new Intl.DateTimeFormat(language, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          hourCycle: 'h23',
                        }).format(new Date(item.updatedAt))}
                      </time>
                      <span>{item.context}</span>
                    </div>
                  </li>{/each}
              </ul>
              {#if sources.some((group) => group.hasMore)}<p
                  class="settings-help inbox-more-results"
                >
                  <SettingsGuidance
                    message="More unread items are available. Increase the limit in Settings to show more."
                    {language}
                  />
                </p>{/if}
            </div>
          </div>
        </div>
      </Collapsible.Content>
    </Collapsible>
  </div>
{:else if !pending}<p class="inbox-empty">
    <SettingsGuidance message="Connect an inbox in Settings." {language} />
  </p>{/if}
