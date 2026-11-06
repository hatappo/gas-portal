import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PassThrough } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { probeMessages, parseProbeOptions, readHiddenToken } from '../scripts/slack-probe.mjs';

const token = 'xoxp-test-only-never-a-live-token';
const identity = { ok: true, user_id: 'U_TEST', team_id: 'T_TEST' };
const reply = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
const searchFetch = response => async url => url.pathname.endsWith('auth.test') ? reply(identity) : response;

test('Probe authenticates once and searches only saved messages without exposing bodies or extra fields', async () => {
  const calls = [];
  const result = await probeMessages(token, async (url, options) => {
    calls.push({ url, options });
    return reply(calls.length === 1 ? identity : { ok: true, messages: {
      total: 120, pagination: { next_cursor: 'next' }, matches: [{
        channel: { id: 'C_TEST', name: 'Private channel' }, ts: '1.2',
        permalink: 'https://example.slack.com/archives/C_TEST/p12', text: 'Private message body', unexpected: token,
      }],
    } });
  });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(call => call.url.pathname), ['/api/auth.test', '/api/search.messages']);
  assert.deepEqual(calls.map(call => call.options.method), ['POST', 'GET']);
  for (const call of calls) {
    assert.equal(call.url.origin, 'https://slack.com');
    assert.equal(call.url.href.includes(token), false);
    assert.equal(call.options.headers.Authorization, `Bearer ${token}`);
    assert.equal(call.options.redirect, 'error');
    assert.ok(call.options.signal instanceof AbortSignal);
  }
  assert.equal(calls[1].url.searchParams.get('query'), 'is:saved');
  assert.equal(calls[1].url.searchParams.get('count'), '100');
  assert.equal(result.userId, 'U_TEST');
  assert.equal(result.hasMore, true);
  assert.equal(result.reportedSearchTotal, 120);
  assert.deepEqual(result.items, [{ channelId: 'C_TEST', timestamp: '1.2', permalink: 'https://example.slack.com/archives/C_TEST/p12' }]);
  assert.doesNotMatch(JSON.stringify(result), /Private message|Private channel|xoxp-/);
});

test('Probe distinguishes zero results, unknown pagination, and incomplete pages', async () => {
  for (const [messages, total, more] of [
    [{ total: 0, matches: [] }, 0, false],
    [{ matches: [] }, null, null],
    [{ pagination: { total_count: 250, page_count: 3 }, matches: [] }, 250, true],
    [{ paging: { total: 0, pages: 0 }, matches: [] }, 0, false],
  ]) {
    const result = await probeMessages(token, searchFetch(reply({ ok: true, messages })));
    assert.equal(result.reportedSearchTotal, total);
    assert.equal(result.hasMore, more);
  }
});

test('Invalid credentials or failed identity checks stop before message search', async () => {
  let calls = 0;
  await assert.rejects(probeMessages('xoxb-bot', async () => { calls++; }), /User OAuth Token/);
  assert.equal(calls, 0);
  await assert.rejects(probeMessages(token, async () => { calls++; return reply({ ...identity, bot_id: 'B_TEST' }); }), /workspace user/);
  assert.equal(calls, 1);
});

test('Missing scope, rate limits, transport failures and malformed responses remain explicit and do not leak raw data', async () => {
  await assert.rejects(probeMessages(token, searchFetch(reply({ ok: false, error: 'missing_scope' }))), /User Token Scopes/);
  await assert.rejects(probeMessages(token, searchFetch(new Response(token, { status: 429, headers: { 'Retry-After': '20' } }))), /Retry after 20 seconds/);
  await assert.rejects(probeMessages(token, searchFetch(new Response(token, { status: 503 }))), /HTTP 503/);
  await assert.rejects(probeMessages(token, searchFetch(reply({ ok: true }))), /no message list/);
  for (const fetchImpl of [
    async () => { throw new Error(token); },
    searchFetch(new Response(token)),
    searchFetch(reply({ ok: false, error: token })),
  ]) {
    await assert.rejects(probeMessages(token, fetchImpl), error => !error.message.includes(token));
  }
});

function terminal() {
  const input = new PassThrough();
  input.isTTY = true;
  input.isRaw = false;
  input.setRawMode = value => { input.isRaw = value; };
  const output = new PassThrough();
  output.isTTY = true;
  let text = '';
  output.on('data', chunk => { text += chunk.toString(); });
  return { input, output, text: () => text };
}

test('Hidden prompt does not echo credentials and restores terminal mode after submit or cancellation', async () => {
  for (const cancel of [false, true]) {
    const term = terminal();
    const pending = readHiddenToken(term.input, term.output);
    term.input.write(token);
    term.input.write(cancel ? '\x03' : '\r');
    if (cancel) await assert.rejects(pending, /Cancelled/);
    else assert.equal(await pending, token);
    assert.equal(term.input.isRaw, false);
    assert.equal(term.text().includes(token), false);
    term.input.destroy();
    term.output.destroy();
  }
  await assert.rejects(readHiddenToken(new PassThrough(), new PassThrough()), /interactive terminal/);
});

test('Probe help works without credentials or a terminal', () => {
  const help = execFileSync(process.execPath, ['scripts/slack-probe.mjs', '--help'], { encoding: 'utf8' });
  assert.match(help, /search:read/);
  assert.match(help, /not a Portal integration or a To-do API/);
});


test('Custom queries remain one encoded search parameter and report the query echoed by Slack', async () => {
  for (const query of ['is:to-do', 'is:saved before:2026-10-10', 'in:general "a & b"']) {
    let searched = false;
    const result = await probeMessages(token, async url => {
      if (url.pathname.endsWith('auth.test')) return reply(identity);
      searched = true;
      assert.equal(url.origin, 'https://slack.com');
      assert.equal(url.searchParams.get('query'), query);
      assert.equal(url.searchParams.size, 6);
      return reply({ ok: true, query, messages: { total: 0, matches: [] } });
    }, query);
    assert.equal(searched, true);
    assert.equal(result.query, query);
    assert.equal(result.echoedQuery, query);
  }
});

test('Query arguments preserve the saved-message default and reject invalid options before authentication', async () => {
  assert.deepEqual(parseProbeOptions([]), { help: false, inspect: false, raw: false, query: 'is:saved' });
  assert.deepEqual(parseProbeOptions(['--query', 'is:to-do']), { help: false, inspect: false, raw: false, query: 'is:to-do' });
  assert.equal(parseProbeOptions(['--query=is:saved before:2026-10-10']).query, 'is:saved before:2026-10-10');
  for (const args of [['--query'], ['--query', ' '], ['--query', 'a'.repeat(1001)], ['--query', 'a\nb'], ['--token', token], [token]]) {
    assert.throws(() => parseProbeOptions(args), error => !error.message.includes(token));
  }
  let calls = 0;
  await assert.rejects(probeMessages(token, async () => { calls++; }, ''), /non-empty/);
  assert.equal(calls, 0);
});


test('Optional inspection reveals response structure and boolean flags without raw string or numeric values', async () => {
  assert.equal(parseProbeOptions(['--inspect']).inspect, true);
  const payload = { ok: true, messages: { total: 1, matches: [{
    text: 'PRIVATE_MESSAGE_BODY', secret: token, timestamp: 123456789,
    todo: { is_completed: true, status: 'PRIVATE_STATUS', title: 'PRIVATE_TASK_TITLE' },
  }] } };
  const plain = await probeMessages(token, searchFetch(reply(payload)));
  assert.equal(Object.hasOwn(plain, 'inspection'), false);
  const result = await probeMessages(token, searchFetch(reply(payload)), 'is:to-do', true);
  assert.equal(result.inspection.truncated, false);
  assert.deepEqual(result.inspection.fields.find(field => field.path.endsWith('.todo.is_completed')),
    { path: '$.messages.matches[0].todo.is_completed', type: 'boolean', value: true });
  assert.deepEqual(result.inspection.fields.find(field => field.path.endsWith('.todo.status')),
    { path: '$.messages.matches[0].todo.status', type: 'string' });
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_|xoxp-|123456789/);
});

test('Inspection reports sampling and depth/size limits instead of claiming exhaustive coverage', async () => {
  const payloads = [
    { ok: true, messages: { total: 2, matches: [{}, { text: 'PRIVATE_SECOND_MESSAGE' }] } },
    { ok: true, messages: { matches: [{ todo: { nested: { secret: 'PRIVATE_DEEP_VALUE' } } }] } },
    { ok: true, messages: { matches: [Object.fromEntries(Array.from({ length: 200 }, (_, n) => [`field${n}`, 'PRIVATE_VALUE']))] } },
  ];
  for (const payload of payloads) {
    const result = await probeMessages(token, searchFetch(reply(payload)), 'is:to-do', true);
    assert.equal(result.inspection.truncated, true);
    assert.ok(result.inspection.fields.length <= 150);
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_/);
  }
});


test('Raw mode retains every returned message and deep fields only when explicitly requested, and redacts the supplied token', async () => {
  assert.equal(parseProbeOptions(['--raw']).raw, true);
  assert.equal(parseProbeOptions(['--raw', '--inspect']).inspect, true);
  const payload = { ok: true, query: 'is:to-do', messages: { total: 2, matches: [
    { ts: '1.1', text: 'First test message', blocks: [{ elements: [{ elements: [{ text: 'Deep nested text', diagnostic: token }] }] }], todo: { completed: false } },
    { ts: '2.2', text: 'Second test message', todo: { completed: true }, extra: { reflected: `prefix ${token} suffix` } },
  ] }, response_metadata: { next_cursor: '' } };
  const plain = await probeMessages(token, searchFetch(reply(payload)));
  const inspected = await probeMessages(token, searchFetch(reply(payload)), 'is:to-do', true);
  for (const result of [plain, inspected]) {
    assert.equal(Object.hasOwn(result, 'rawResponse'), false);
    assert.doesNotMatch(JSON.stringify(result), /First test message|Second test message|Deep nested text/);
  }
  const raw = await probeMessages(token, searchFetch(reply(payload)), 'is:to-do', false, true);
  assert.deepEqual(raw.rawResponse, JSON.parse(JSON.stringify(payload).replaceAll(token, '[REDACTED]')));
  assert.equal(raw.rawResponse.messages.matches.length, 2);
  assert.equal(raw.rawResponse.messages.matches[0].blocks[0].elements[0].elements[0].text, 'Deep nested text');
  assert.doesNotMatch(JSON.stringify(raw), /xoxp-/);
});
