// Animate the live panel, retaining its layout space until the closing motion ends.
export function createCalendarPanelMotion(panel: HTMLElement) {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let open = false;
  let animation: Animation | undefined;
  function cancel() {
    if (!animation) return;
    animation.onfinish = null;
    animation.oncancel = null;
    animation.cancel();
    animation = undefined;
  }
  function settle() {
    cancel();
    panel.hidden = !open;
    panel.inert = false;
    delete panel.dataset.calendarMotion;
    document.body.classList.toggle('calendar-open', open);
  }
  function setOpen(next: boolean, animate = false) {
    const previous = animation ? { transform: getComputedStyle(panel).transform, opacity: getComputedStyle(panel).opacity } : undefined;
    cancel();
    open = next;
    const icon = document.querySelector('#toggle-calendar svg');
    if (!animate || reduced?.matches || !panel.animate || !icon) { settle(); return; }
    panel.hidden = false;
    document.body.classList.add('calendar-open');
    const box = panel.getBoundingClientRect();
    const target = icon.getBoundingClientRect();
    // Compact Settings hides the panel with CSS; do not animate an invisible region.
    if (!box.width || !box.height || !target.width || !target.height) { settle(); return; }
    const collapsed = {
      transform: `translate(${target.left - box.left}px, ${target.top - box.top}px) scale(${target.width / box.width}, ${target.height / box.height})`,
      opacity: 0.08,
    };
    const expanded = { transform: 'translate(0px, 0px) scale(1, 1)', opacity: 1 };
    panel.inert = true;
    panel.dataset.calendarMotion = open ? 'opening' : 'closing';
    animation = panel.animate([
      { ...(previous || (open ? collapsed : expanded)), transformOrigin: '0 0' },
      { ...(open ? expanded : collapsed), transformOrigin: '0 0' },
    ], { duration: open ? 340 : 240, easing: open ? 'cubic-bezier(0.22, 1, 0.36, 1)' : 'cubic-bezier(0.4, 0, 1, 1)', fill: 'both' });
    animation.onfinish = settle;
    animation.oncancel = settle;
  }
  // A changed layout invalidates the captured coordinates. Finish safely in the latest state.
  window.addEventListener('resize', settle);
  window.addEventListener('scroll', () => { if (animation) settle(); }, { passive: true });
  document.addEventListener('portal:tabchange', settle);
  document.addEventListener('visibilitychange', () => { if (document.hidden) settle(); });
  reduced?.addEventListener('change', () => { if (reduced.matches) settle(); });
  return { setOpen };
}
