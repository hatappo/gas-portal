import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';

const HELP = `Usage: npm run probe:slack

Read-only discovery probe for Slack saved messages (search.messages, is:saved).
Requires a User OAuth Token with search:read. Paste it at the hidden prompt.
No token arguments, environment files, or saved credentials are used.
Outputs account IDs and up to 100 message permalinks, without message bodies.
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

export async function probeSavedMessages(token, fetchImpl = fetch) {
  token = token.trim();
  if (!/^xoxp-[A-Za-z0-9-]+$/.test(token)) throw new ProbeError('Enter a User OAuth Token beginning with xoxp-.');
  const identity = await request('auth.test', token, {}, fetchImpl);
  if (identity.bot_id || !identity.user_id || !identity.team_id) throw new ProbeError('The token did not identify a workspace user.');
  const data = await request('search.messages', token, {
    query: 'is:saved', count: '100', cursor: '*', sort: 'timestamp', sort_dir: 'desc', highlight: 'false',
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
    query: 'is:saved',
    fetchedAt: new Date().toISOString(),
    returnedCount: messages.matches.length,
    reportedSearchTotal: reportedTotal,
    hasMore,
    items: messages.matches.map(message => ({
      channelId: message.channel?.id ?? null,
      timestamp: message.ts ?? null,
      permalink: message.permalink ?? null,
    })),
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
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--help') {
      console.log(HELP);
    } else if (args.length) {
      throw new ProbeError('Unsupported arguments. Use --help; never pass a token as an argument.');
    } else {
      const token = await readHiddenToken();
      const result = await probeSavedMessages(token);
      // Defense in depth: never echo the token even if an upstream field contains it.
      console.log(JSON.stringify(result, null, 2).replaceAll(token.trim(), '[REDACTED]'));
    }
  } catch (error) {
    console.error(error instanceof ProbeError ? error.message : 'The probe failed. No raw response or credentials were printed.');
    process.exitCode = 1;
  }
}
