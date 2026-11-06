/** Offline-only fixture. Tokens are neither persisted nor sent to Slack. */
export function createSlackPreview(scenario, getCacheSeconds = () => 300, getLimit = () => 20) {
  let connections = scenario === 'disconnected' ? [] : [{ id: '33333333-3333-4333-8333-333333333333', tokenSuffix: 'mo', label: 'Example workspace@demo-user' }];
  const fetched = new Map();
  return {
    getSlackConnections() { setTimeout(() => this.success({ ok: true, connections }), 200); },
    saveSlackConnection(input) {
      if ((input.token && input.token !== 'demo') || (!input.id && !input.token)) return setTimeout(() => this.success({ ok: false, error: 'INVALID_INPUT' }), 150);
      if (!input.id && connections.length) return setTimeout(() => this.success({ ok: false, error: 'DUPLICATE_CONNECTION' }), 150);
      const connection = { id: input.id || '33333333-3333-4333-8333-333333333333', tokenSuffix: 'mo', label: 'Example workspace@demo-user' };
      connections = [connection]; fetched.clear();
      setTimeout(() => this.success({ ok: true, connection }), 200);
    },
    disconnectSlack(id) { connections = connections.filter((entry) => entry.id !== id); fetched.clear(); setTimeout(() => this.success({ ok: true }), 150); },
    getSlackActionItems(id, force = false) {
      setTimeout(() => {
        if (!connections.some((entry) => entry.id === id)) return this.success({ ok: false, error: 'INVALID_CONNECTION' });
        if (['unauthorized', 'rate-limit', 'scope', 'error'].includes(scenario)) return this.success({ ok: false, error: scenario === 'unauthorized' ? 'UNAUTHORIZED' : scenario === 'rate-limit' ? 'RATE_LIMITED' : scenario === 'scope' ? 'MISSING_SCOPE' : 'REQUEST_FAILED' });
        const ttl = getCacheSeconds();
        const limit = getLimit();
        const key = id + ':' + limit;
        const cached = !force && ttl > 0 && fetched.has(key) && Date.now() - fetched.get(key) < ttl * 1000;
        const fetchedAt = cached ? fetched.get(key) : Date.now();
        fetched.delete(key);
        if (ttl > 0 && scenario !== 'partial') fetched.set(key, fetchedAt);
        const items = scenario === 'empty' ? [] : [
          { id: 'TDEMO:CDEMO:1793987462.000001', title: 'Read the notes from our planning session', url: 'https://example.slack.com/archives/CDEMO/p1793987462000001', context: 'Example workspace · team', postedAt: new Date(Date.now() - 120000).toISOString() },
          { id: 'TDEMO:CDEMO:1793987462.000002', title: '来週のリリースに向けた確認事項', url: 'https://example.slack.com/archives/CDEMO/p1793987462000002', context: 'Example workspace · releases', postedAt: new Date(Date.now() - 3600000).toISOString() },
        ];
        const matches = scenario === 'more' ? Array.from({ length: 55 }, (_, index) => ({ ...items[index % 2], id: 'demo:' + index, title: 'Saved message ' + (index + 1) })) : items;
        this.success({ ok: true, items: matches.slice(0, limit), hasMore: matches.length > limit, fetchedAt, cached, partial: scenario === 'partial', error: scenario === 'partial' ? 'RATE_LIMITED' : '' });
      }, 450);
    },
  };
}
