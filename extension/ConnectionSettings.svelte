<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { validateConfig, pageLabel, type PanelConfig } from './config';
  let { config, t, onsave, oncancel }: { config: PanelConfig; t: (key: string) => string; onsave: (value: PanelConfig) => Promise<void>; oncancel: () => void } = $props();
  let draft = $state<PanelConfig>(untrack(() => structuredClone($state.snapshot(config))));
  let busy = $state(false), error = $state('');
  let dragging = $state(''), dropTarget = $state(''), orderStatus = $state('');
  async function movePage(id: string, target: number, handle?: HTMLButtonElement) {
    const index = draft.pages.findIndex(page => page.id === id);
    if (index < 0 || target < 0 || target >= draft.pages.length || index === target) return;
    const pages = [...draft.pages];
    const [page] = pages.splice(index, 1);
    if (!page) return;
    pages.splice(target, 0, page);
    draft.pages = pages;
    orderStatus = 'Page order updated. Save to apply.';
    // Moving DOM nodes may blur the button; preserve keyboard reordering across moves.
    if (handle) { await tick(); if (handle.isConnected) handle.focus(); }
  }
  if (!draft.pages.length) draft.pages.push({ id: crypto.randomUUID(), name: '', url: '' });
  function addPage() { draft.pages.push({ id: crypto.randomUUID(), name: '', url: '' }); }
  async function save(event: SubmitEvent) {
    event.preventDefault(); error = ''; busy = true;
    try { await onsave(validateConfig($state.snapshot(draft))); }
    catch (reason) { error = reason instanceof Error ? reason.message : 'Could not save the connection. Try again.'; }
    finally { busy = false; }
  }
</script>
<form onsubmit={save}>
  <fieldset disabled={busy}>
    <section aria-labelledby="pages-title">
      <div class="section-heading"><h2 id="pages-title">{t('Pages')}</h2><button type="button" class="btn preset-tonal" onclick={addPage} disabled={draft.pages.length >= 20}>{t('Add page')}</button></div>
      <p class="help">{t('URLs can include {nonce}, which is replaced with a new random value whenever you open or reload a page.')}</p>
      <div role="list" aria-label={t('Pages')}>
      {#each draft.pages as page, i (page.id)}
        <div class="settings-card" class:drop-target={dropTarget === page.id && dragging !== page.id} role="listitem" ondragover={(event) => { if (dragging) { event.preventDefault(); dropTarget = page.id; } }} ondrop={(event) => { event.preventDefault(); if (dragging) movePage(dragging, i); dragging = ''; dropTarget = ''; }}>

          <div class="entry-heading"><div class="entry-order"><button type="button" class="btn drag-handle" draggable={!busy} aria-label={t('Reorder page') + ' ' + (pageLabel(page) || i + 1)} title={t('Drag to reorder, or use the Up and Down arrow keys.')} ondragstart={(event) => { dragging = page.id; if (event.dataTransfer) { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', page.id); } }} ondragend={() => { dragging = ''; dropTarget = ''; }} onkeydown={(event) => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); void movePage(page.id, i + (event.key === 'ArrowUp' ? -1 : 1), event.currentTarget); } }}><svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg></button><span>{i + 1}</span></div><button type="button" class="btn remove" aria-label={t('Remove page') + ' ' + (pageLabel(page) || i + 1)} onclick={() => { draft.pages = draft.pages.filter(item => item.id !== page.id); }}>{t('Remove')}</button></div>
          <label for={'page-name-' + page.id}>{t('Page name')}</label><input id={'page-name-' + page.id} class="input" bind:value={page.name} maxlength="80" />
          <label for={'page-url-' + page.id}>{t('Page URL')}</label><textarea id={'page-url-' + page.id} class="textarea page-url" rows="2" bind:value={page.url} required placeholder="https://…" autocomplete="off" spellcheck="false"></textarea>
        </div>
      {/each}
      </div>
      <p class="sr-only" role="status" aria-live="polite">{t(orderStatus)}</p>
    </section>
    {#if error}<p class="error" role="alert">{t(error)}</p>{/if}
    <div class="actions save-actions"><button class="btn preset-filled-primary-500">{t('Save and connect')}</button><button type="button" class="btn preset-tonal" onclick={oncancel}>{t('Cancel')}</button></div>
  </fieldset>
</form>
