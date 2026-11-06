import { createSignal, onCleanup, splitProps, mergeProps, type JSX } from 'solid-js';
import { render, spread } from 'solid-js/web';
import { Tooltip } from '@kobalte/core/tooltip';

// Bridge the existing language controller into Solid without sharing DOM ownership.
export function useLanguage() {
  const [language, setLanguage] = createSignal(document.documentElement.lang);
  const update = () => setLanguage(document.documentElement.lang);
  document.addEventListener('portal:languagechange', update);
  onCleanup(() => document.removeEventListener('portal:languagechange', update));
  return language;
}

export function Hint(props: {
  text: string;
  placement?: 'top' | 'left';
  children: (attributes: JSX.HTMLAttributes<HTMLElement>) => JSX.Element;
}) {
  const [open, setOpen] = createSignal(false);
  const close = () => setOpen(false);
  document.addEventListener('portal:tabchange', close);
  onCleanup(() => document.removeEventListener('portal:tabchange', close));
  return <Tooltip open={open()} onOpenChange={setOpen} openDelay={350} closeDelay={100} placement={props.placement || 'top'} gutter={8} flip={props.placement === 'left' ? 'top bottom right' : true} slide fitViewport overflowPadding={12}>
    <Tooltip.Trigger as={(attributes: JSX.HTMLAttributes<HTMLElement> & { type?: string }) => {
      // The trigger may be a link or label, not necessarily a button.
      const [, rest] = splitProps(attributes, ['type']);
      return props.children(rest);
    }} />
    <Tooltip.Portal><Tooltip.Content class="portal-tooltip">{props.text}</Tooltip.Content></Tooltip.Portal>
  </Tooltip>;
}

// Keep existing RPC event listeners and timestamp descriptions on the refresh buttons.
export function mountRefreshHints() {
  for (const id of ['refresh-catalog', 'refresh-actions']) {
    const button = document.getElementById(id)!;
    const key = button.getAttribute('data-i18n-title') || 'Fetch latest';
    const description = button.getAttribute('aria-describedby');
    button.removeAttribute('title');
    button.removeAttribute('data-i18n-title');
    const host = document.createElement('span');
    host.style.display = 'contents';
    button.replaceWith(host);
    render(() => {
      const language = useLanguage();
      return <Hint text={PortalI18n.t(key, language())}>{(attributes) => {
        spread(button, mergeProps(attributes, {
          get 'aria-describedby'() { return [description, attributes['aria-describedby']].filter(Boolean).join(' ') || undefined; },
        }), false, true);
        return button;
      }}</Hint>;
    }, host);
  }
}
