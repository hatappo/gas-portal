<script lang="ts">
  import { Combobox, Portal, useListCollection } from '@skeletonlabs/skeleton-svelte';
  import { onMount } from 'svelte';
  import ServiceLogo from './ServiceLogo.svelte';
  import { language } from './language-store';
  import { actionTypes, normalizeSearch, typeSuggestion, type ActionFilters } from './action-search';
  import type { Cell } from './view';
  let { filters, update }: { filters: Cell<ActionFilters>; update(value: ActionFilters): void } = $props();
  let open = $state(false);
  let composing = $state(false);
  const t = (key: string, values = {}) => PortalI18n.t(key, $language, values);
  const focusInput = () => document.getElementById('actions-search')?.focus();
  let token = $derived(typeSuggestion($filters.text));
  let selected = $derived($filters.types.flatMap(id => actionTypes.filter(type => type.id === id)));
  let candidates = $derived(actionTypes.filter(type => !$filters.types.includes(type.id) &&
    normalizeSearch([type.id, type.serviceLabel, type.label, t(type.label)].join(' ')).includes(token?.term || '')));
  let collection = $derived(useListCollection({ items: candidates, itemToValue: item => item.id,
    itemToString: item => item.serviceLabel + ' · ' + t(item.label) }));
  const choose = (id: string) => {
    if (composing || !token || !candidates.some(type => type.id === id)) return;
    update({ text: token.prefix, types: [...$filters.types, id] });
    open = false;
  };
  const remove = (id: string) => {
    update({ ...$filters, types: $filters.types.filter(value => value !== id) });
    focusInput();
  };
  onMount(() => {
    const close = () => { open = false; };
    document.addEventListener('portal:tabchange', close);
    return () => document.removeEventListener('portal:tabchange', close);
  });
</script>

<Combobox
  class="action-search"
  ids={{ input: 'actions-search' }}
  {collection}
  value={[]}
  inputValue={$filters.text}
  open={open && !!token && !composing}
  onOpenChange={event => { open = event.open && !!token && !composing; }}
  onValueChange={event => { if (event.value[0]) choose(event.value[0]); }}
  selectionBehavior="preserve"
  inputBehavior="autohighlight"
  openOnClick={false}
  positioning={{ placement: 'bottom-start', sameWidth: true, gutter: 6, overflowPadding: 12 }}
>
  <Combobox.Label class="visually-hidden">{t('Search inbox and tasks')}</Combobox.Label>
  <Combobox.Control class="search-box input action-search-control">
    <svg class="action-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>
    {#each selected as type (type.id)}
      <button type="button" class="chip preset-filled-surface-200-800 action-type-chip"
        title={type.serviceLabel + ' · ' + t(type.label)}
        aria-label={t('Remove filter: {filter}', { filter: type.serviceLabel + ' · ' + t(type.label) })}
        data-filter-type={type.id}
        onclick={() => remove(type.id)}
        onkeydown={event => { if (event.key === 'Backspace' || event.key === 'Delete') { event.preventDefault(); remove(type.id); } }}>
        <ServiceLogo service={type.service} label={type.serviceLabel} decorative />
        <span class="action-type-label">{t(type.label)}</span>
        <span aria-hidden="true" class="action-type-remove">×</span>
      </button>
    {/each}
    <Combobox.Input type="search" placeholder={t('Search or filter with is:')}
      oninput={event => {
        const text = event.currentTarget.value;
        update({ ...$filters, text });
        open = !!typeSuggestion(text) && !composing;
      }}
      oncompositionstart={() => { composing = true; open = false; }}
      oncompositionend={event => {
        composing = false;
        update({ ...$filters, text: event.currentTarget.value });
        open = !!typeSuggestion(event.currentTarget.value);
      }}
      onkeydowncapture={event => {
        if (event.isComposing || composing) { event.stopPropagation(); return; }
        if (event.key === 'Backspace' && !$filters.text && selected.length) {
          event.preventDefault(); event.stopPropagation();
          document.querySelector<HTMLButtonElement>('.action-type-chip:last-of-type')?.focus();
        }
      }}
    />
    <kbd class="kbd search-shortcut" data-search-shortcut aria-hidden="true"></kbd>
  </Combobox.Control>
  <Portal>
    <Combobox.Positioner class="action-type-positioner">
      <Combobox.Content class="action-type-options" aria-label={t('Filter by type')}>
        {#each candidates as type (type.id)}
          <Combobox.Item item={type} class="action-type-option">
            <ServiceLogo service={type.service} label={type.serviceLabel} decorative />
            <Combobox.ItemText><span class="visually-hidden">{type.serviceLabel} · </span>{t(type.label)}</Combobox.ItemText>
            <span class="action-type-key" aria-hidden="true">is:{type.id}</span>
          </Combobox.Item>
        {:else}
          <li role="presentation" class="action-type-empty">{t('No matching types')}</li>
        {/each}
      </Combobox.Content>
    </Combobox.Positioner>
  </Portal>
</Combobox>
