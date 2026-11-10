<script lang="ts">
  let {
    service,
    label,
    decorative = false,
  }: { service: string; label: string; decorative?: boolean } = $props();
  const names: Record<string, string> = {
    github: 'github',
    slack: 'slack',
    gmail: 'gmail',
    calendar: 'calendar',
    drive: 'drive',
  };
  let name = $derived(Object.prototype.hasOwnProperty.call(names, service) ? names[service] : '');
</script>

{#if name}<span
    class={'service-logo service-logo-' + name}
    role={decorative ? undefined : 'img'}
    aria-label={decorative ? undefined : label}
    aria-hidden={decorative ? 'true' : undefined}
    title={decorative ? undefined : label}
  >
    {#if !decorative}<span class="visually-hidden" aria-hidden="true">{label}</span>{/if}
  </span>{:else}{label}{/if}
