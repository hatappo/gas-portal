import { flushSync, mount, type Component } from 'svelte';
import { writable, get, type Readable } from 'svelte/store';

/** Synchronous boundary between RPC controllers and Svelte-owned view islands. */
export type Cell<T> = Readable<T> & (() => T);
export function createCell<T>(initial: T): [Cell<T>, (value: T | ((previous: T) => T)) => void] {
  const store = writable(initial);
  const read = Object.assign(() => get(store), { subscribe: store.subscribe });
  return [
    read,
    (value) =>
      flushSync(() =>
        store.set(typeof value === 'function' ? (value as (previous: T) => T)(get(store)) : value),
      ),
  ];
}
export function mountView<P extends Record<string, unknown>>(
  component: Component<P>,
  target: Element,
  props: P,
) {
  return flushSync(() => mount(component, { target, props }));
}
export function element(id: string): HTMLElement {
  const node = document.getElementById(id);
  if (!node) throw new Error('Missing UI element: ' + id);
  return node;
}
