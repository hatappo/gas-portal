import { mountView } from './view';
import DisclosureHost from './DisclosureHost.svelte';
export function mountDisclosures() {
  document.querySelectorAll<HTMLElement>('[data-disclosure]').forEach((source) => {
    const title = source.querySelector<HTMLElement>('[data-disclosure-title]')!;
    const nodes = Array.from(source.querySelector('[data-disclosure-content]')!.childNodes);
    const host = document.createElement('div');
    source.replaceWith(host);
    mountView(DisclosureHost, host, { title, nodes, className: source.className });
  });
}
