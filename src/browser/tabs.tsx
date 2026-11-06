import { type Accessor, type JSX } from 'solid-js';
import { render, spread } from 'solid-js/web';
import { Hint, useLanguage } from './ui';
import { Tabs } from '@kobalte/core/tabs';

interface Tab { hash: string; button: HTMLElement; panel: HTMLElement }

// Adopt the server-rendered panels instead of recreating forms or discarding drafts.
// Kobalte owns focus, keyboard navigation and tab/panel ARIA relationships.
export function mountTabs(tabs: Tab[], selected: Accessor<number>, select: (index: number) => void) {
  const list = tabs[0].button.parentElement!;
  const host = document.createElement('div');
  host.className = 'tab-host';
  host.style.display = 'contents';
  list.replaceWith(host);
  const labels = tabs.map(({ button }) => Array.from(button.childNodes));
  const attributes = (node: HTMLElement) => Object.fromEntries(Array.from(node.attributes)
    .filter(({ name }) => !['role', 'tabindex', 'aria-selected', 'aria-controls', 'hidden'].includes(name))
    .map(({ name, value }) => [name, value]));
  render(() => {
    const language = useLanguage();
    return <Tabs style={{ display: 'contents' }} value={tabs[selected()].hash} onChange={(value) => select(tabs.findIndex((tab) => tab.hash === value))}>
      <Tabs.List {...attributes(list)}>
        {tabs.map(({ hash, button }, index) => {
          const trigger = (hint: JSX.HTMLAttributes<HTMLElement> = {}) => <Tabs.Trigger {...hint} {...attributes(button)} value={hash} aria-controls={tabs[index].panel.id} onClick={() => select(index)}>{labels[index]}</Tabs.Trigger>;
          if (button.id !== 'tab-settings') return trigger();
          button.removeAttribute('title');
          button.removeAttribute('data-i18n-title');
          return <Hint text={PortalI18n.t('Settings', language())}>{trigger}</Hint>;
        })}
      </Tabs.List>
      {tabs.map(({ hash, panel }, index) => {
        const ExistingPanel = (props: JSX.HTMLAttributes<HTMLElement>) => { spread(panel, props, false, true); return panel; };
        return <Tabs.Content as={ExistingPanel} value={hash} id={panel.id} forceMount hidden={selected() !== index} />;
      })}
    </Tabs>;
  }, host);
  // Clients still address controls by their stable IDs (for example Manage connections).
  tabs.forEach((tab) => { tab.button = document.getElementById(tab.button.id)!; });
}

