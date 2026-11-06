// The short appearance animation shared by the results and tab panels.
export function createMotion() {
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  /** Animate an element into view, unless the user prefers reduced motion.
   * @param {HTMLElement} target @returns {Animation | undefined}
   */
  function appear(target) {
    if (reducedMotion?.matches || typeof target.animate !== 'function') return;
    return target.animate([
      { opacity: 0.45, transform: 'translateY(5px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 220, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
  }

  /** Run a callback when the user turns on reduced motion, to stop running animations. @param {() => void} callback */
  function onReduce(callback) {
    reducedMotion?.addEventListener('change', () => { if (reducedMotion.matches) callback(); });
  }

  return { appear, onReduce };
}
