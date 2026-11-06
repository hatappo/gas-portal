// Shared choices for the per-connection saved-message search limit.
globalThis.PortalSlackSettings = (() => {
  const choices = [10, 20, 50, 100, 200];
  const defaultLimit = 20;
  /** @param {unknown} value */
  const normalize = (value) => choices.find((choice) => String(choice) === String(value)) ?? defaultLimit;
  /** @param {unknown} value */
  const isChoice = (value) => typeof value === 'number' && choices.includes(value);
  return { choices, defaultLimit, normalize, isChoice };
})();
