<script lang="ts">
  import { faviconSources } from './favicon';
  let {
    url,
    icon,
    class: className,
    size,
    slack = false,
  }: { url: string; icon?: string; class: string; size: number; slack?: boolean } = $props();
  let textIcon = $derived(icon && !PortalCatalogRules.isIconUrl(icon));
  let sources = $derived(textIcon ? [] : [...(icon ? [icon] : []), ...faviconSources(url)]);
  let index = $state(0);
  let loaded = $state(false);
  let previousSource: string;
  $effect(() => {
    const source = JSON.stringify([url, icon]);
    if (source !== previousSource) {
      previousSource = source;
      reset();
    }
  });
  function reset() {
    index = 0;
    loaded = false;
  }
  const next = () => {
    loaded = false;
    index++;
  };
</script>

{#if slack}<span
    class="service-logo service-logo-slack"
    style:width={size + 'px'}
    style:height={size + 'px'}
    aria-hidden="true"
  ></span>
{:else}<span
    class={[className, textIcon ? 'is-text' : '', loaded ? 'is-loaded' : ''].join(' ')}
    aria-hidden="true"
  >
    <span class={className + '-fallback'}>{textIcon ? icon : '🌐'}</span>
    {#if index < sources.length}<img
        width={size}
        height={size}
        alt=""
        loading="lazy"
        decoding="async"
        referrerpolicy="no-referrer"
        src={sources[index]}
        onerror={next}
        onload={(event) => {
          const image = event.currentTarget as HTMLImageElement;
          if (image.naturalWidth > 0 && (image.naturalWidth < 8 || image.naturalHeight < 8)) next();
          else loaded = true;
        }}
      />{/if}
  </span>{/if}
