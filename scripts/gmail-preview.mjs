/** Offline Gmail headers only, with no credentials or Google requests. */
export function createGmailPreview(scenario, getCacheSeconds) {
  let settings = { ...PortalGmail.defaults(), enabled: Boolean(scenario) && scenario !== 'disabled' };
  try { const stored = localStorage.getItem('portal-preview-gmail'); if (stored) settings = PortalGmail.restore(JSON.parse(stored)); } catch { /* Optional preview settings. */ }
  let cached;
  return {
    getGmailSettings() { setTimeout(() => this.success({ ok: true, settings: { ...settings } }), 120); },
    saveGmailSettings(input) {
      if (!PortalGmail.validSettings(input)) return setTimeout(() => this.success({ ok: false, error: 'INVALID_INPUT' }), 150);
      settings = { ...input }; cached = undefined;
      try { localStorage.setItem('portal-preview-gmail', JSON.stringify(settings)); } catch { /* Optional storage. */ }
      setTimeout(() => this.success({ ok: true, settings: { ...settings } }), 150);
    },
    getGmailActionItems(force = false) {
      setTimeout(() => {
        const errors = { unauthorized: 'AUTHORIZATION_REQUIRED', forbidden: 'FORBIDDEN', 'rate-limit': 'RATE_LIMITED', error: 'REQUEST_FAILED' };
        if (!settings.enabled) return this.success({ ok: false, error: 'DISABLED' });
        if (errors[scenario]) return this.success({ ok: false, error: errors[scenario] });
        const now = Date.now(), ttl = getCacheSeconds();
        if (!force && ttl && cached && now - cached.fetchedAt < ttl * 1000) return this.success({ ...cached, cached: true });
        const titles = ['Review the project proposal', 'Meeting notes and next steps', 'Your monthly invoice'];
        const count = scenario === 'more' ? settings.limit : scenario === 'empty' ? 0 : 3;
        const items = Array.from({ length: count }, (_, index) => ({ id: (0x19abc000 + index).toString(16), threadId: (0x19abc000 + index).toString(16), title: titles[index % titles.length] + (index > 2 ? ' ' + (index + 1) : ''), sender: ['Alex <alex@example.com>', 'Design team <design@example.com>', 'Billing <billing@example.com>'][index % 3], receivedAt: new Date(now - (index + 1) * 600000).toISOString() }));
        const result = { ok: true, account: 'demo@example.com', items, partial: scenario === 'partial', error: scenario === 'partial' ? 'REQUEST_FAILED' : '', hasMore: scenario === 'more', fetchedAt: now, cached: false };
        if (!result.partial) cached = result;
        this.success(result);
      }, 250);
    },
  };
}
