import { For, createSignal, createEffect, onCleanup, type Accessor } from 'solid-js';
import { render } from 'solid-js/web';
import { DropdownMenu } from '@kobalte/core/dropdown-menu';
import { useLanguage } from './ui';

interface PortalTab { hash: string; button: HTMLElement; panel: HTMLElement }

export function mountCompactNavigation(tabs: PortalTab[], selected: Accessor<number>, select: (index: number) => void) {
  const host = document.getElementById('compact-navigation')!;
  const icons = tabs.map(tab => tab.button.querySelector('svg')!.cloneNode(true));
  const labels = ['Links', 'Inbox & Tasks', 'Settings'];
  render(() => {
    const language = useLanguage();
    const label = (index: number) => PortalI18n.t(labels[index], language());
    const [open, setOpen] = createSignal(false);
    const close = () => setOpen(false);
    const syncCompact = (compact: boolean) => {
      if (document.documentElement.dataset.compact === String(compact)) return;
      const active = document.activeElement;
      document.documentElement.dataset.compact = String(compact);
      close();
      if (compact && tabs.some(tab => tab.button === active)) document.getElementById('compact-nav-trigger')?.focus({ preventScroll: true });
      else if (!compact && host.contains(active)) tabs[selected()].button.focus({ preventScroll: true });
    };
    // Match the viewport breakpoint that moves the calendar above the main pane.
    if (typeof matchMedia !== 'undefined') {
      const layout = matchMedia('(max-width: 760px)');
      const change = () => syncCompact(layout.matches);
      change();
      layout.addEventListener('change', change);
      onCleanup(() => layout.removeEventListener('change', change));
    }
    document.addEventListener('portal:tabchange', close);
    onCleanup(() => document.removeEventListener('portal:tabchange', close));
    createEffect(() => { selected(); close(); });
    return <DropdownMenu open={open()} onOpenChange={setOpen} modal={false} placement="bottom-end" gutter={8}>
      <DropdownMenu.Trigger id="compact-nav-trigger" class="btn btn-ghost btn-square" aria-label={PortalI18n.t('Switch section: {section}', language(), { section: label(selected()) })} title={label(selected())}>
        {(() => { const index = selected(); return icons[index].cloneNode(true); })()}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal><DropdownMenu.Content class="compact-nav-menu" onCloseAutoFocus={event => {
        if (document.documentElement.dataset.compact === 'false') {
          event.preventDefault();
          tabs[selected()].button.focus({ preventScroll: true });
        }
      }}>
        <DropdownMenu.RadioGroup value={tabs[selected()].hash} onChange={hash => select(tabs.findIndex(tab => tab.hash === hash))} aria-label={PortalI18n.t('Portal sections', language())}>
          <For each={tabs}>{(tab, index) => <DropdownMenu.RadioItem class="compact-nav-item" value={tab.hash} textValue={label(index())} data-portal-tab={tab.button.id.replace('tab-', '')}>
            {icons[index()].cloneNode(true)}<span>{label(index())}</span><DropdownMenu.ItemIndicator class="compact-nav-selected" aria-hidden="true">✓</DropdownMenu.ItemIndicator>
          </DropdownMenu.RadioItem>}</For>
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content></DropdownMenu.Portal>
    </DropdownMenu>;
  }, host);
}
