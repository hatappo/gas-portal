import { createEffect, createSignal, on, onCleanup, type JSX } from 'solid-js';
import { render } from 'solid-js/web';
import { Collapsible } from '@kobalte/core/collapsible';

export function Disclosure(props: {
  title: JSX.Element;
  children: JSX.Element;
  class?: string;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = createSignal(props.autoOpen ?? false);
  // Follow changed error severity, but keep the user's choice during ordinary updates.
  createEffect(on(() => props.autoOpen, (value) => setOpen(value ?? false), { defer: true }));
  return <Collapsible class={['portal-disclosure', props.class].filter(Boolean).join(' ')}
    data-portal-disclosure="" open={open()} onOpenChange={setOpen} forceMount ref={(root) => {
      const reveal = () => setOpen(true);
      root.addEventListener('portal:disclosure-open', reveal);
      onCleanup(() => root.removeEventListener('portal:disclosure-open', reveal));
    }}>
    <Collapsible.Trigger class="disclosure-trigger">
      <span class="disclosure-chevron" aria-hidden="true" />
      <span>{props.title}</span>
    </Collapsible.Trigger>
    <Collapsible.Content class="disclosure-content" inert={!open()} aria-hidden={!open()}>
      {/* Keep nodes mounted for RPC updates and form drafts. An inner grid animates
          intrinsic height without depending on a stale measurement of async content. */}
      <div class="disclosure-body"><div class="disclosure-inner"><div class="disclosure-copy">
        {props.children}
      </div></div></div>
    </Collapsible.Content>
  </Collapsible>;
}

// Preserve IDs, localized labels, and the DOM nodes used by the existing controllers.
export function mountDisclosures() {
  document.querySelectorAll<HTMLElement>('[data-disclosure]').forEach((source) => {
    const title = source.querySelector<HTMLElement>('[data-disclosure-title]')!;
    const content = source.querySelector<HTMLElement>('[data-disclosure-content]')!;
    const nodes = Array.from(content.childNodes);
    const host = document.createElement('div');
    source.replaceWith(host);
    render(() => <Disclosure class={source.className} title={title}>{nodes}</Disclosure>, host);
  });
}
