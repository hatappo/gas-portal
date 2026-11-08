/**
 * GAS editor: open Authorization.gs, select authorizePortal and Run to grant required permissions.
 * This entry point checks consent only; it does not read or change settings.
 * The build preserves this standalone file so it is easy to find.
 */
function authorizePortal() {
  console.info('PORTAL_AUTHORIZATION_CHECK_STARTED');
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
  console.info('PORTAL_AUTHORIZATION_GRANTED: All required permissions are granted. No additional authorization is needed.');
  return { ok: true };
}
