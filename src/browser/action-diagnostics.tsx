import { For, Show } from 'solid-js';
import { Disclosure } from './disclosure';

/** Ephemeral aggregates for the latest batch, independent of the text filter. */
export function ActionDiagnostics(props: { entries: ActionDiagnostic[]; language: string }) {
  const t = (key: string, values = {}) => PortalI18n.t(key, props.language, values);
  const freshness = (entry: ActionDiagnostic) => {
    if (!Number.isFinite(entry.fetchedAt)) return '';
    const time = new Intl.DateTimeFormat(props.language, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(entry.fetchedAt);
    return t(entry.cached ? 'Cached · Retrieved {time}' : 'Retrieved {time}', { time });
  };
  return <Disclosure title={t('Diagnostics')} class="action-diagnostics">
    <Show when={props.entries.length} fallback={<p>{t('No diagnostic data yet.')}</p>}>
      <p class="diagnostics-help">{t('Latest retrieval only. Search counts are reported by the service, not the total number of outstanding tasks.')}</p>
      <For each={props.entries}>{entry => <section class="diagnostics-source" aria-label={entry.label}>
        <div class="diagnostics-heading"><strong>{entry.label}</strong><span>{freshness(entry)}</span></div>
        <ul class="diagnostics-metrics"><For each={entry.metrics}>{metric => <li>
          <span class="diagnostic-label">{t(metric.label)}</span>{': '}<span class="diagnostic-value">{metric.value === null ? t('Unknown') : typeof metric.value === 'number' ? (metric.unit === 'items' ? t('{count} items', { count: metric.value.toLocaleString(props.language) }) : metric.value.toLocaleString(props.language)) : t(metric.value)}</span>
        </li>}</For></ul>
      </section>}</For>
    </Show>
  </Disclosure>;
}
