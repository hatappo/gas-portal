/** Offline-only RPC fixture. Never persist, log, or send the token field anywhere. */
export function createGitHubPreview(scenario, getCacheSeconds = () => 300) {
  let connections = [{ id: '11111111-1111-4111-8111-111111111111', tokenSuffix: 'mo', label: 'example@demo-user', login: 'demo-user', owner: 'example' }];
  if (scenario === 'disconnected') connections = [];
  if (scenario === 'multiple' || scenario === 'multiple-error') connections.push({ id: '22222222-2222-4222-8222-222222222222', tokenSuffix: 'mo', label: '*@demo-user', login: 'demo-user', owner: '' });
  const item = (number, title, kind, reasons) => ({
    id: 'example/portal#' + number, title, kind, reasons, repository: 'example/portal', number,
    url: 'https://github.com/example/portal/' + (kind === 'issue' ? 'issues/' : 'pull/') + number,
    updatedAt: new Date(Date.now() - number * 60000).toISOString(),
  });
  const assigned = [item(42, 'Review the onboarding guide for the next release', 'issue', ['assigned']), item(38, '整理する: shared workspace links', 'issue', ['assigned'])];
  const direct = [item(56, 'Improve keyboard navigation in Settings', 'pull', ['direct'])];
  const team = [item(56, 'Improve keyboard navigation in Settings', 'pull', ['team']), item(61, 'Add read-only calendar integration', 'pull', ['team'])];
  const changes = [item(64, 'Simplify the portal setup instructions', 'pull', ['changes'])];
  const fetched = new Map();
  return {
    getGitHubConnections() { setTimeout(() => this.success({ ok: true, connections }), 150); },
    saveGitHubConnection(input) {
      // Only a dummy token is accepted in preview; no token is retained even in memory.
      if (input.token && input.token !== 'demo') return setTimeout(() => this.success({ ok: false, error: 'INVALID_INPUT' }), 150);
      const connection = { id: input.id || crypto.randomUUID(), tokenSuffix: 'mo', label: (input.owner.trim() || '*') + '@demo-user', login: 'demo-user', owner: input.owner.trim() };
      connections = [...connections.filter((entry) => entry.id !== connection.id), connection];
      fetched.delete(connection.id);
      setTimeout(() => this.success({ ok: true, connection }), 200);
    },
    disconnectGitHub(id) { connections = connections.filter((entry) => entry.id !== id); fetched.delete(id); setTimeout(() => this.success({ ok: true }), 150); },
    getGitHubActionItems(id, force = false) {
      setTimeout(() => {
        if (scenario === 'multiple-error' && id.startsWith('2222')) return this.success({ ok: false, error: 'FORBIDDEN' });
        if (scenario === 'unauthorized' || scenario === 'rate-limit' || scenario === 'error') return this.success({ ok: false, error: scenario === 'unauthorized' ? 'UNAUTHORIZED' : scenario === 'rate-limit' ? 'RATE_LIMITED' : 'REQUEST_FAILED' });
        const ttl = getCacheSeconds();
        const cached = !force && ttl > 0 && fetched.has(id) && Date.now() - fetched.get(id) < ttl * 1000;
        const fetchedAt = cached ? fetched.get(id) : Date.now();
        fetched.delete(id);
        if (ttl > 0 && scenario !== 'partial') fetched.set(id, fetchedAt);
        this.success({ ok: true, fetchedAt, cached, groups: ['assigned', 'direct', 'team', 'changes'].map((kind, index) => {
          let items = scenario === 'empty' ? [] : [assigned, direct, team, changes][index];
          if (scenario === 'multiple' && id.startsWith('2222') && kind === 'assigned') items = [...items, { ...item(7, 'Plan the next personal project milestone', 'issue', ['assigned']), id: 'demo-user/notes#7', repository: 'demo-user/notes', url: 'https://github.com/demo-user/notes/issues/7' }];
          return { kind, items: scenario === 'partial' && kind === 'team' ? [] : items, total: items.length, partial: scenario === 'partial' && kind === 'team', error: scenario === 'partial' && kind === 'team' ? 'FORBIDDEN' : '', searchUrl: 'https://github.com/search?type=issues' };
        }) });
      }, id.startsWith('2222') ? 700 : 300);
    },
  };
}
