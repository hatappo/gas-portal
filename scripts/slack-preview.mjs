/** Offline-only fixture. Tokens are neither persisted nor sent to Slack. */
export function createSlackPreview(scenario, getCacheSeconds = () => 300) {
  let connections = scenario === 'disconnected' ? [] : [{ id: '33333333-3333-4333-8333-333333333333', label: 'Example workspace@demo-user' }];
  const fetched = new Map();
  return {
    getSlackConnections() { setTimeout(() => this.success({ ok: true, connections }), 200); },
    saveSlackConnection(input) {
      if ((input.token && input.token !== 'demo') || (!input.id && !input.token)) return setTimeout(() => this.success({ ok: false, error: 'INVALID_INPUT' }), 150);
      if (!input.id && connections.length) return setTimeout(() => this.success({ ok: false, error: 'DUPLICATE_CONNECTION' }), 150);
      const connection = { id: input.id || '33333333-3333-4333-8333-333333333333', label: 'Example workspace@demo-user' };
      connections = [connection]; fetched.delete(connection.id);
      setTimeout(() => this.success({ ok: true, connection }), 200);
    },
    disconnectSlack(id) { connections = connections.filter((entry) => entry.id !== id); fetched.delete(id); setTimeout(() => this.success({ ok: true }), 150); },
    getSlackActionItems(id, force = false) {
      setTimeout(() => {
        if (!connections.some((entry) => entry.id === id)) return this.success({ ok: false, error: 'INVALID_CONNECTION' });
        if (['unauthorized', 'rate-limit', 'scope', 'error'].includes(scenario)) return this.success({ ok: false, error: scenario === 'unauthorized' ? 'UNAUTHORIZED' : scenario === 'rate-limit' ? 'RATE_LIMITED' : scenario === 'scope' ? 'MISSING_SCOPE' : 'REQUEST_FAILED' });
        const ttl = getCacheSeconds();
        const cached = !force && ttl > 0 && fetched.has(id) && Date.now() - fetched.get(id) < ttl * 1000;
        const fetchedAt = cached ? fetched.get(id) : Date.now();
        fetched.delete(id);
        if (ttl > 0 && scenario !== 'partial') fetched.set(id, fetchedAt);
        const items = scenario === 'empty' ? [] : [
          { id: 'TDEMO:CDEMO:1793987462.000001', title: 'Read the notes from our planning session', url: 'https://example.slack.com/archives/CDEMO/p1793987462000001', context: 'Example workspace · team', postedAt: new Date(Date.now() - 120000).toISOString() },
          { id: 'TDEMO:CDEMO:1793987462.000002', title: '来週のリリースに向けた確認事項', url: 'https://example.slack.com/archives/CDEMO/p1793987462000002', context: 'Example workspace · releases', postedAt: new Date(Date.now() - 3600000).toISOString() },
        ];
        this.success({ ok: true, items, fetchedAt, cached, partial: scenario === 'partial', error: scenario === 'partial' ? 'RATE_LIMITED' : '' });
      }, 450);
    },
  };
}
