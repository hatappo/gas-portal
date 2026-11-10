<script lang="ts">
  import SettingsGuidance from './SettingsGuidance.svelte';
  import Inbox from './Inbox.svelte';
  import SourceLink from './SourceLink.svelte';
  import ServiceLogo from './ServiceLogo.svelte';
  import Disclosure from './Disclosure.svelte';
  import ActionDiagnostics from './ActionDiagnostics.svelte';
  import { tagPalette } from './tag-palette.js';
  import { formatListCount } from './list-presentation.js';
  import type { Cell } from './view';
  import type { ActionView } from './action-view';
  let {
    state,
    query,
    clearFilters,
    part,
  }: { state: Cell<ActionView>; query: Cell<string>; clearFilters: () => void; part: string } =
    $props();
  const t = (key: string) => PortalI18n.t(key, $state.language);
  const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase('ja').trim();
  const matches = (item: ActionItem) =>
    normalize([item.title || t(item.titleFallback || ''), item.context].join(' ')).includes($query);
  let filtered = $derived($state.items.filter(matches));
  let inboxItems = $derived($state.inboxes.flatMap((group) => group.items));
  const typeColor = (service: string, reason: string) => {
    const colors: Record<string, string> = {
      'Assigned issue': tagPalette[0],
      'Direct review': tagPalette[1],
      'Team review': tagPalette[2],
      'Changes requested': tagPalette[3],
    };
    return service === 'github'
      ? colors[reason] || tagPalette[5]
      : service === 'slack'
        ? tagPalette[4]
        : tagPalette[5];
  };
</script>

{#if part === 'inbox'}<Inbox
    groups={$state.inboxes}
    pending={$state.pending}
    language={$state.language}
    {matches}
    filtering={!!$query}
  />
{:else if part === 'inboxCount'}{($state.hasResults || !$state.pending) &&
  $state.inboxes.every((group) => group.loaded && (!group.failed || group.items.length > 0))
    ? formatListCount(inboxItems.filter(matches).length, inboxItems.length, $state.language)
    : '—'}
{:else if part === 'count'}{$state.hasResults || !$state.pending
    ? formatListCount(filtered.length, $state.items.length, $state.language)
    : '—'}
{:else if part === 'status'}
  {#if $state.notices.length}<Disclosure autoOpen={!$state.items.length}>
      {#snippet title()}{t('Some results could not be retrieved.')}{/snippet}
      <ul>
        {#each $state.notices as entry}<li>
            <span>
              {[entry.label, entry.notice.reason && t(entry.notice.reason)]
                .filter(Boolean)
                .map((part) => part + ' · ')
                .join('')}<SettingsGuidance
                message={entry.notice.message}
                language={$state.language}
              />
            </span>
            {#if entry.notice.url}
              <SourceLink url={entry.notice.url}>{t('View source')}</SourceLink>{/if}
          </li>{/each}
      </ul>
    </Disclosure>{/if}
{:else if part === 'items'}
  {#if filtered.length}<ul class="action-item-list">
      {#each filtered as item (item.service + ':' + item.id)}<li>
          <SourceLink url={item.url} class="action-item-title link link-hover">
            {item.title || t(item.titleFallback || '')}
          </SourceLink>
          <div class="action-item-meta">
            <span class="action-service">
              <ServiceLogo service={item.service} label={item.serviceLabel} />
            </span>
            <time datetime={item.updatedAt}>
              {t(item.dateLabel || 'Updated') +
                ' ' +
                new Intl.DateTimeFormat($state.language, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  hourCycle: 'h23',
                }).format(new Date(item.updatedAt))}
            </time>
            <span class="action-context">{item.context}</span>
          </div>
          <div class="action-item-reasons">
            {#each item.reasons as reason}<span
                class="action-item-kind badge"
                style:--tag-accent={typeColor(item.service, reason)}
              >
                {t(reason)}
              </span>{/each}
          </div>
        </li>{/each}
    </ul>
  {:else if !$state.pending && !$state.notices.length}<div class="status" role="status">
      <h3>{t('No items to display')}</h3>
      <p>
        <SettingsGuidance
          message={$query
            ? 'No items match your filters.'
            : $state.connected
              ? $state.moreSources.length
                ? 'No tasks in the checked results.'
                : 'No tasks right now.'
              : 'Connect a task service in Settings.'}
          language={$state.language}
        />
      </p>
      {#if $query}<button type="button" class="reset-button btn btn-sm" onclick={clearFilters}>
          {t('Clear filters')}
        </button>{/if}
    </div>{/if}
  {#each $state.moreSources as source}<p class="settings-help action-more-results">
      {source + ' · '}<SettingsGuidance
        message="The 200-item check limit was reached. Older results have not been checked."
        language={$state.language}
      />
    </p>{/each}
{:else if part === 'diagnostics'}<ActionDiagnostics
    entries={$state.diagnostics}
    language={$state.language}
  />{/if}
