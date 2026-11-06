import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { parseArgs } from 'node:util';

const HELP = `Usage: npm run probe:slack -- [--query "is:saved"] [--inspect] [--raw]

Read-only Slack message-search probe (search.messages; defaults to is:saved).
Use --query "is:to-do" to test To-do search, or add date/channel filters.
Date filters refer to message dates, not the date a bookmark was added.
--inspect adds response field names/types and boolean values, never raw text.
Inspection samples the first element of arrays and limits depth/output size.
--raw adds the complete first-page search response, including all message bodies,
blocks and metadata, without inspection sampling. The supplied token is redacted.
Requires a User OAuth Token with search:read. Paste it at the hidden prompt.
No token arguments, environment files, or saved credentials are used.
By default, outputs account IDs and up to 100 message permalinks, without bodies.
This is a source-checkout diagnostic, not a Portal integration or a To-do API.
See README.md: Slack saved-message probe.
`;

class ProbeError extends Error {}

const slackErrors = {
  invalid_auth: 'The token is invalid. Use the User OAuth Token from your Slack app.',
  not_authed: 'Slack did not accept authentication.',
  token_revoked: 'The token has been revoked. Reinstall or reauthorize the app.',
  token_expired: 'The token has expired. Obtain a current user token.',
  account_inactive: 'The Slack account is inactive.',
  missing_scope: 'Add search:read under User Token Scopes, then reinstall/reauthorize the app.',
  not_allowed_token_type: 'This method needs a user token, not a bot or app token.',
  access_denied: 'Access was denied. Check workspace app approval and search permissions.',
  ratelimited: 'Slack rate-limited the request. Wait before trying again.',
};

async function request(method, token, params, fetchImpl) {
  const url = new URL(`https://slack.com/api/${method}`);
  url.search = new URLSearchParams(params).toString();
  let response, data;
  try {
    response = await fetchImpl(url, {
      method: method === 'auth.test' ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 429) {
      const seconds = Number(response.headers.get('retry-after'));
      throw new ProbeError(`${method}: rate limited.${seconds > 0 && Number.isFinite(seconds) ? ` Retry after ${Math.ceil(seconds)} seconds.` : ' Retry later.'}`);
    }
    if (!response.ok) throw new ProbeError(`${method}: HTTP ${response.status}.`);
    data = await response.json();
  } catch (error) {
    if (error instanceof ProbeError) throw error;
    // Do not print transport exceptions, response bodies, or headers containing secrets.
    throw new ProbeError(`${method}: request failed or timed out, or the response was not JSON.`);
  }
  if (data?.ok !== true) {
    const message = Object.hasOwn(slackErrors, data?.error ?? '') ? slackErrors[data.error] : 'Slack rejected the request (unrecognized error).';
    throw new ProbeError(`${method}: ${message}`);
  }
  return data;
}

function validateQuery(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000 || /[\r\n\0]/.test(value)) {
    throw new ProbeError('Provide a non-empty, single-line query of at most 1000 characters.');
  }
  return value.trim();
}

export function parseProbeOptions(args) {
  let values;
  try {
    ({ values } = parseArgs({ args, options: { query: { type: 'string' }, help: { type: 'boolean' }, inspect: { type: 'boolean' }, raw: { type: 'boolean' } }, allowPositionals: false, strict: true }));
  } catch {
    throw new ProbeError('Unsupported arguments. Use --help; never pass a token as an argument.');
  }
  return { help: values.help ?? false, inspect: values.inspect ?? false, raw: values.raw ?? false, query: validateQuery(values.query ?? 'is:saved') };
}

// Show structure rather than raw messages; boolean flags can be compared across states.
function inspectFields(data) {
  const fields = [];
  let truncated = false;
  function visit(value, path, depth) {
    if (fields.length >= 150) { truncated = true; return; }
    const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    fields.push({ path, type, ...(type === 'boolean' ? { value } : {}) });
    if (type !== 'object' && type !== 'array') return;
    const entries = Object.entries(value);
    if (depth >= 5) { if (entries.length) truncated = true; return; }
    if (type === 'array') {
      if (entries.length > 1) truncated = true;
      if (value.length) visit(value[0], `${path}[0]`, depth + 1);
    } else {
      for (const [key, child] of entries) {
        if (fields.length >= 150) { truncated = true; break; }
        visit(child, `${path}.${key}`, depth + 1);
      }
    }
  }
  visit(data, '$', 0);
  return { fields, truncated, note: 'Field names/types and boolean values only. Arrays show their first element; depth and output size are bounded. Missing fields in this sample do not prove the API never exposes them.' };
}

export async function probeMessages(token, fetchImpl = fetch, query = 'is:saved', inspect = false, raw = false) {
  query = validateQuery(query);
  token = token.trim();
  if (!/^xoxp-[A-Za-z0-9-]+$/.test(token)) throw new ProbeError('Enter a User OAuth Token beginning with xoxp-.');
  const identity = await request('auth.test', token, {}, fetchImpl);
  if (identity.bot_id || !identity.user_id || !identity.team_id) throw new ProbeError('The token did not identify a workspace user.');
  const data = await request('search.messages', token, {
    query, count: '100', cursor: '*', sort: 'timestamp', sort_dir: 'desc', highlight: 'false',
  }, fetchImpl);
  const messages = data.messages;
  if (!Array.isArray(messages?.matches)) throw new ProbeError('search.messages: unexpected response; no message list was returned.');
  const total = messages.total ?? messages.pagination?.total_count ?? messages.paging?.total;
  const reportedTotal = Number.isSafeInteger(total) && total >= 0 ? total : null;
  const nextCursor = messages.pagination?.next_cursor || messages.paging?.next_cursor || data.response_metadata?.next_cursor;
  const pages = messages.pagination?.page_count ?? messages.paging?.pages;
  let hasMore = null;
  if (nextCursor || pages > 1 || reportedTotal > messages.matches.length) hasMore = true;
  else if (reportedTotal !== null || pages === 0 || pages === 1) hasMore = false;
  return {
    workspaceId: identity.team_id,
    userId: identity.user_id,
    method: 'search.messages',
    query,
    echoedQuery: typeof data.query === 'string' ? data.query : null,
    fetchedAt: new Date().toISOString(),
    returnedCount: messages.matches.length,
    reportedSearchTotal: reportedTotal,
    hasMore,
    items: messages.matches.map(message => ({
      channelId: message.channel?.id ?? null,
      timestamp: message.ts ?? null,
      permalink: message.permalink ?? null,
    })),
    ...(inspect ? { inspection: inspectFields(data) } : {}),
    // Opt-in raw diagnostics retain every returned item and nested field, but not this credential.
    ...(raw ? { rawResponse: JSON.parse(JSON.stringify(data).replaceAll(token, '[REDACTED]')) } : {}),
    note: 'First page only. Search results are not a verified To-do list or task count. Compare links with Slack Saved and To-dos; message grouping, indexing and search preferences can affect results.',
  };
}

export async function readHiddenToken(input = process.stdin, output = process.stderr) {
  if (!input.isTTY || !output.isTTY) throw new ProbeError('Run this command in an interactive terminal. Do not pass a token in arguments.');
  const muted = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const reader = createInterface({ input, output: muted, terminal: true, historySize: 0 });
  output.write('Slack User OAuth Token (hidden; Enter to submit, Ctrl+C to cancel): ');
  try {
    return await new Promise((resolve, reject) => {
      reader.once('line', resolve);
      reader.once('SIGINT', () => reject(new ProbeError('Cancelled.')));
      reader.once('close', () => reject(new ProbeError('Input closed.')));
    });
  } finally {
    reader.close();
    muted.end();
    output.write('\n');
  }
}

if (import.meta.main) {
  try {
    const options = parseProbeOptions(process.argv.slice(2));
    if (options.help) {
      console.log(HELP);
    } else {
      const token = await readHiddenToken();
      const result = await probeMessages(token, fetch, options.query, options.inspect, options.raw);
      // Defense in depth: never echo the token even if an upstream field contains it.
      console.log(JSON.stringify(result, null, 2).replaceAll(token.trim(), '[REDACTED]'));
    }
  } catch (error) {
    console.error(error instanceof ProbeError ? error.message : 'The probe failed. No raw response or credentials were printed.');
    process.exitCode = 1;
  }
}
