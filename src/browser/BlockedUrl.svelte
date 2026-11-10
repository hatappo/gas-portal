<script lang="ts">
  let { url, language }: { url: string; language: string } = $props();
</script>

<span class="blocked-url">
  <span class="blocked-url-label badge badge-bordered">
    {PortalI18n.t('Blocked scheme', language)}
  </span>
  <span class="blocked-url-text">{url}</span>
</span>
