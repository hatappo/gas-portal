<script lang="ts">
  import Disclosure from './Disclosure.svelte';
  let { entries, language }: { entries: ActionDiagnostic[]; language: string } = $props();
  const t = (key: string, values = {}) => PortalI18n.t(key, language, values);
  const freshness = (entry: ActionDiagnostic) => {
    if (!Number.isFinite(entry.fetchedAt)) return '';
    return t(entry.cached ? 'Cached · Retrieved {time}' : 'Retrieved {time}', {
      time: new Intl.DateTimeFormat(language, {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(entry.fetchedAt),
    });
  };
</script>

<Disclosure class="action-diagnostics">
  {#snippet title()}{t('Diagnostics')}{/snippet}
  {#if entries.length}<p class="diagnostics-help">
      {t(
        'Latest retrieval only. Search counts are reported by the service, not the total number of outstanding tasks.',
      )}
    </p>
    {#each entries as entry}<section class="diagnostics-source" aria-label={entry.label}>
        <div class="diagnostics-heading">
          <strong>{entry.label}</strong>
          <span>{freshness(entry)}</span>
        </div>
        <ul class="diagnostics-metrics">
          {#each entry.metrics as metric}<li>
              <span class="diagnostic-label">{t(metric.label)}</span>
              :
              <span class="diagnostic-value">
                {metric.value === null
                  ? t('Unknown')
                  : typeof metric.value === 'number'
                    ? metric.unit === 'items'
                      ? t('{count} items', { count: metric.value.toLocaleString(language) })
                      : metric.value.toLocaleString(language)
                    : t(metric.value)}
              </span>
            </li>{/each}
        </ul>
      </section>{/each}
  {:else}<p>{t('No diagnostic data yet.')}</p>{/if}
</Disclosure>
