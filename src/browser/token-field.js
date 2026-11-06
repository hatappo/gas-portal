/** Show only a server-provided suffix; masked text must never be submitted as a token.
 * @param {HTMLInputElement} input @param {HTMLButtonElement} replace
 */
export function initializeTokenField(input, replace) {
  replace.addEventListener('click', () => {
    input.value = '';
    input.type = 'password'; input.readOnly = false;
    replace.hidden = true;
    input.focus();
  });
  return {
    /** @param {{tokenSuffix?: string} | undefined} connection */
    edit(connection) {
      input.value = '';
      input.readOnly = Boolean(connection);
      input.type = connection ? 'text' : 'password';
      input.required = !connection;
      replace.hidden = !connection;
      if (connection) input.value = '••••••••' + (/^[A-Za-z0-9_-]{2}$/.test(connection.tokenSuffix || '') ? connection.tokenSuffix : '');
    },
    take() {
      if (input.readOnly) return '';
      const value = input.value;
      input.value = '';
      return value;
    },
  };
}
