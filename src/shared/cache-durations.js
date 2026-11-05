// Shared by the GAS server and browser bundle. Cache duration choices offered in Settings.
globalThis.PortalCacheDurations = (() => {
  // Catalog: the tools and links list. Actions: shared by all Action Items providers.
  const kinds = {
    catalog: { defaultSeconds: 21600, choices: [0, 300, 3600, 21600] },
    actions: { defaultSeconds: 300, choices: [0, 60, 300, 900, 1800, 3600, 21600] },
  };
  /** @type {Record<number, string>} */
  const labels = { 0: 'Disabled', 60: '1 minute', 300: '5 minutes', 900: '15 minutes', 1800: '30 minutes', 3600: '1 hour', 21600: '6 hours' };

  /** Return a supported duration, or the default for anything else.
   * @param {'catalog' | 'actions'} kind @param {unknown} value
   */
  function normalize(kind, value) {
    const { choices, defaultSeconds } = kinds[kind];
    const match = choices.find((seconds) => String(seconds) === String(value));
    return match === undefined ? defaultSeconds : match;
  }

  /** Accept only a number that is one of the choices. @param {'catalog' | 'actions'} kind @param {unknown} value */
  function isChoice(kind, value) {
    return typeof value === 'number' && kinds[kind].choices.includes(value);
  }

  /** The i18n key for a choice, marking the default. @param {'catalog' | 'actions'} kind @param {number} seconds */
  function label(kind, seconds) {
    return labels[seconds] + (seconds === kinds[kind].defaultSeconds && seconds !== 0 ? ' (default)' : '');
  }

  return { catalog: kinds.catalog, actions: kinds.actions, normalize, isChoice, label };
})();
