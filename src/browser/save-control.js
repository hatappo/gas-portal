// Shared save flow for the settings controls. Each control runs one save at a time:
// only its latest request may update the page, a missing reply times out, and a failed
// reply restores the last saved state.
/**
 * @param {{status: HTMLElement, t: (key: string) => string, setBusy: (busy: boolean) => void}} control
 */
export function createSaver({ status, t, setBusy }) {
  let generation = 0;
  /**
   * Start a save. `confirm` checks the reply after updating the page and returns the message to show.
   * It returns false to fail with `failureMessage`, or `{error}` to fail with a translated server message.
   * @template T
   * @param {{
   *   send: (runner: GasRunner) => void,
   *   confirm: (response: T) => string | false | {error: string},
   *   failureMessage: string,
   *   restore?: () => void,
   *   busyMessage?: string,
   *   timeoutMessage?: string,
   *   timeoutMs?: number,
   * }} request
   */
  return function save({
    send, confirm, failureMessage, restore = () => {},
    busyMessage = 'Saving…', timeoutMessage = 'Could not confirm the save. Reload the page to check.', timeoutMs = 15000,
  }) {
    const current = ++generation;
    setBusy(true);
    status.textContent = t(busyMessage);
    status.setAttribute('aria-busy', 'true');
    /** @param {string} message */
    const end = (message) => {
      setBusy(false);
      status.setAttribute('aria-busy', 'false');
      status.textContent = message;
    };
    const timeout = window.setTimeout(() => {
      if (current !== generation) return;
      generation++;
      restore();
      end(t(timeoutMessage));
    }, timeoutMs);
    const fail = (message = t(failureMessage)) => {
      window.clearTimeout(timeout);
      if (current !== generation) return;
      restore();
      end(message);
    };
    try {
      send(google.script.run.withSuccessHandler((/** @type {T} */ response) => {
        if (current !== generation) return;
        const result = confirm(response);
        if (result === false) fail();
        else if (typeof result === 'object') fail(result.error);
        else {
          window.clearTimeout(timeout);
          end(result);
        }
      }).withFailureHandler(() => fail()));
    } catch { fail(); }
  };
}
/** Fail with the server's message when it sent one; otherwise use the default failure message.
 * @param {unknown} response @returns {false | {error: string}}
 */
export function serverError(response) {
  const reply = /** @type {{ok?: boolean, error?: unknown} | null | undefined} */ (response);
  if (!reply || reply.ok || typeof reply.error !== 'string') return false;
  return { error: PortalI18n.translate(reply.error, document.documentElement.lang) };
}
