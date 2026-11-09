import { createEffect, createSignal, on, onCleanup, Show, type JSX } from 'solid-js';
import { Tooltip } from '@kobalte/core/tooltip';
import { useLanguage } from './ui';

export function CalendarToggle(props: { open: boolean; toggle: (open: boolean) => void }) {
  const language = useLanguage();
  const t = (key: string) => PortalI18n.t(key, language());
  const media = typeof matchMedia === 'undefined' ? undefined : matchMedia('(max-width: 760px)');
  const [compact, setCompact] = createSignal(media?.matches ?? false);
  const inSettings = () => document.getElementById('settings-panel')?.hidden === false;
  const [settings, setSettings] = createSignal(inSettings());
  const [hintOpen, setHintOpen] = createSignal(false);
  const suppressed = () => compact() && settings();
  const resize = () => setCompact(media?.matches ?? false);
  const navigate = () => { setSettings(inSettings()); setHintOpen(false); };
  media?.addEventListener('change', resize);
  document.addEventListener('portal:tabchange', navigate);
  onCleanup(() => {
    media?.removeEventListener('change', resize);
    document.removeEventListener('portal:tabchange', navigate);
  });
  createEffect(on([suppressed, () => props.open], () => setHintOpen(false)));
  // Track the SVG itself: inserting a DocumentFragment empties it, so it cannot be removed on a later switch.
  const icon = (id: string) => document.querySelector<HTMLTemplateElement>(id)!.content.querySelector('svg')!.cloneNode(true);
  return <Tooltip open={hintOpen()} onOpenChange={setHintOpen} openDelay={350} closeDelay={100} placement="bottom-end" gutter={8} flip slide fitViewport overflowPadding={12}>
    <Tooltip.Trigger as={(attributes: JSX.HTMLAttributes<HTMLButtonElement>) => <button {...attributes}
      id="toggle-calendar" type="button" class="btn btn-ghost btn-square"
      aria-label={t('Today’s schedule')} aria-expanded={props.open && !suppressed()} aria-controls="calendar-panel"
      aria-disabled={suppressed() || undefined}
      // Keep the explanation open on click; Tooltip.Trigger normally dismisses it.
      onClick={() => { if (suppressed()) setHintOpen(true); else { setHintOpen(false); props.toggle(!props.open); } }}>
      <Show when={suppressed() && props.open} fallback={icon('#calendar-icon')}>{icon('#calendar-off-icon')}</Show>
    </button>} />
    <Tooltip.Portal><Tooltip.Content class="portal-tooltip">{suppressed()
      ? t('In compact view, the calendar is hidden while Settings is open.')
      : t('Today’s schedule')}</Tooltip.Content></Tooltip.Portal>
  </Tooltip>;
}
