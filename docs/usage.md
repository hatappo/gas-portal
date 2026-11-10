# Usage guide

## Initial setup

1. Using the Google account for this work environment, create a standalone Apps Script project. You can create its spreadsheet from the portal after deployment.
2. Install gas-portal in a consumer directory and run `portal init --script-id ID --auth-profile work-a`.
3. Enable the Apps Script API in the account's Apps Script settings. Run `npm run login` and select the correct account. Verify it with `npx portal status`.
4. Upload the code with `npm run push`.
5. Property defaults are initialized automatically. If authorization is needed, open the GAS editor with the deploying account, select `authorizePortal` in `Authorization.gs`, and run it to explicitly request missing consent. Review the authorization prompt; run the function again after consent if the first execution stops.
6. If you will use an existing spreadsheet, prepare its header row and data as described below. Otherwise, the portal can create an empty table for you.
7. Create the first deployment with **Deploy → New deployment → Web app**. Set execution to yourself and access to only yourself.
8. Open the published URL and select **Settings → Sources → Links spreadsheet**. Choose **Create new spreadsheet** with an empty ID to create and connect a new file. Alternatively, enter an existing spreadsheet ID or Google Sheets URL, optionally enter the sheet name, and save. Select **Reload portal** to use the source. For subsequent updates, run `npm run ship` (or `npm run push` followed by `npm run deploy`). A successful deploy saves the selected deploymentId if none was configured.

Use separate GAS projects and spreadsheets for each environment, with access restricted to their owner. User Properties belong to the executing user. Normal page loads supply missing defaults automatically and preserve existing values, including empty strings. Authorization is handled separately by `authorizePortal`; no manual property initialization is needed.

To update application code, upgrade the package, check build / preview, then push / deploy. Changes to spreadsheet data or display settings do not require redeployment.

## Spreadsheet

**Settings → Sources → Links spreadsheet** stores `SPREADSHEET_ID` and `SHEET_NAME` in the executing account's User Properties. The ID field accepts a raw ID or an HTTPS editor URL on `docs.google.com`, such as `https://docs.google.com/spreadsheets/d/ID/edit?gid=123#gid=123` (including `/spreadsheets/u/0/d/ID/edit`). Saving normalizes the URL to its ID. Published `/d/e/` links and other origins are rejected. The URL's `gid` is ignored; select a tab by its name instead.

Leave the sheet name empty to use the first sheet by tab order, including a hidden first sheet. An explicitly configured name that does not exist produces an error rather than falling back to another sheet. Leave the ID empty to disconnect the source. Save, then reload the portal to use the new settings; saving does not verify access or modify spreadsheet permissions. Reloading also discards unsaved form edits. The footer link follows the configured spreadsheet.

On page loads and catalog requests, missing User Properties receive defaults. Existing values, including empty strings, are preserved. Script Properties are neither read nor copied. If the source was previously configured only in Script Properties, enter it once in **Settings → Sources → Links spreadsheet** after updating. Already configured User Properties continue to work.

### Create a new spreadsheet

**Create new spreadsheet** is available only when no ID is saved and the ID input is empty. The server checks the saved User Property again under the same lock used for source settings. Any nonempty saved ID, even an invalid one, stops creation before calling Sheets. Clearing the input alone does not disconnect an existing source; save the empty ID first if you intend to create a replacement.

Creation makes a file named `<portal name>`, with one `Links` sheet and a native Google Sheets table named `PortalLinks`. It contains a header plus 100 empty entry rows and exactly seven columns in this order: `id`, `hidden`, `tags`, `icon`, `name`, `url`, `description`. Columns beyond G do not exist. `hidden` is a checkbox; all other columns are text, including URLs and IDs with leading zeros. The header is frozen, column widths are set, and each header cell has a note describing its format. Notes follow the current portal language at creation, including how a blank `id` makes a related link. Explicit English or Japanese takes priority; Automatic uses the browser language, with English as fallback. Changing the portal language later does not rewrite existing notes. The table header uses a calm blue (`#71a4d9`) with dark text. Add table rows in Sheets as needed.

The public [Table API](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/sheets#Table) does not expose the table-specific **Show condensed view** and **Show gridlines** switches. Enable those manually under the table menu → **Table formatting** after creation. The sheet-wide gridlines setting is separate and does not enable table gridlines.

The new ID is saved automatically to the executing account's `SPREADSHEET_ID` User Property. `SHEET_NAME` is never set or changed; leave it empty to use the new first sheet. If an old name is still configured, clear it and save before reloading. **Open spreadsheet** below the form links to the saved spreadsheet whenever an ID is saved, and to the created file right after creation. Existing spreadsheets are never initialized or overwritten by this action.

The ID is saved immediately after file creation, before table setup, to prevent a failed setup from creating another file on retry. A partial failure says what was completed and exposes the created file. A failure before the create request (an ID already saved, missing consent, the Sheets service disabled) creates nothing, and the form stays usable for a retry. If ID storage failed, the form retains the ID for manual saving; if table setup failed, inspect the created file before using it. If creation cannot be confirmed, check Drive and reload before retrying; the request may still have completed. The UI does not automatically retry or delete files. If it still fails after authorization, inspect the GAS execution log: `SPREADSHEET_CREATION_FAILED` records the exact stage and original exception text. API details are confined to execution logs and never returned to the browser; do not publish logs without reviewing them for private file information.

### Columns

Columns are matched by their case-sensitive names in the first row, so you can rearrange them freely.

| Column | Content |
| --- | --- |
| id | A unique string ID for a tool. Leave it blank to make the row a related link of the tool above (see below) |
| hidden | TRUE hides the row; FALSE or blank keeps it visible. Standard checkboxes are supported |
| tags | Multiple tags separated by commas, Japanese commas, or line breaks |
| icon | Optional. An image URL starting with `https://`, or an emoji or short text (up to 8 characters). Overrides the automatic favicon |
| name | Required. Display name |
| url | Required. Primary link: `https://`, `http://`, or an app scheme such as `vscode://` |
| description | Plain text; HTML and Markdown are not interpreted. For a related link, shown as a tooltip |

The optional `hidden` column is matched by its header, regardless of position. Only `TRUE` (ignoring case and surrounding whitespace) hides a row; other values remain visible. Hidden rows stay in the spreadsheet but are excluded before validation and duplicate-ID checks, and never enter the catalog response, embedded HTML data, or cache. They do not contribute tags, search results, or counts. After changing a checkbox, use **Fetch latest** to bypass an existing cache, or wait for cache expiry.

Optional columns can be omitted. Enter URLs as text rather than named smart chips. Unknown columns are not included in the public response. Spreadsheets created before v0.4.0 have a `scope` column (internal/external); it is now ignored like any other unknown column. Use a tag, such as `External`, if you still want that distinction. Invalid entries are reported with their row numbers. Primary URLs with the Apps Script origin automatically receive a GAS tag.

### Related links

The sheet order is the structure. A row with an `id` is a tool. A row with a blank `id` is a related link of the nearest row above it that has an `id`; blank rows in between are skipped. Tools and related links appear in sheet row order.

```text
id         name                 url
atom       ATOM                 https://atomdata.jp/
           ATOM NEO production  https://www.atom.onl/auth/login
           ATOM NEO dev         https://dev.atom.onl/auth/login
hubspot    HubSpot              https://app.hubspot.com/
           HubSpot notes        https://app.notion.com/...
```

- A related link is shown inside its tool's card and in the list view's **Related links** column, not as a card of its own. It uses its own `name`, `url`, favicon or `icon`, and blocked-scheme handling, and its `description` appears as a tooltip.
- Tag filters treat a tool and its related links as one: the tool shows the union of their tags. Search also matches related links' names. Counts include tools only.
- Hiding a tool row also hides the related links below it. A related link row can also be hidden on its own.
- If a tool row is excluded for its own error (an invalid URL, a duplicate id, …), the related links below it are excluded with a row issue rather than moving to an earlier tool. A blank-id row with no tool row above it is also reported.
- **Sorting the sheet changes the structure.** A related link belongs to whichever tool row ends up above it, so sorting by name or tags moves links between tools. Move a tool together with the related-link rows below it.

Spreadsheets from v0.4.0 and earlier have a `relatedLinks` column with `URL label` lines; it is now ignored. Move each line to its own row with a blank `id`, directly below its tool.

### Permissions

Catalog reads use `spreadsheets.readonly`, which is not restricted to the configured file. Creation and table setup use `drive.file`, which allows writing files created by or explicitly opened with this app; the app does not request the broad `spreadsheets` write scope. Entering an existing spreadsheet ID does not grant per-file write access. The creation permission remains authorized after setup, while ordinary catalog loading only reads data. See the [Sheets authorization scopes](https://developers.google.com/workspace/sheets/api/scopes).

When upgrading to this feature, push and deploy the new code and authorize the added scope as the deploying account. CLI deployment alone does not confirm that the new consent has been granted. Creation checks authorization before calling Sheets and shows editor instructions when consent is missing. If authorization is required, push the latest code, reload the GAS editor, and run `authorizePortal` with that account. This editor entry point calls `ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL)` and does not acquire a lock, read settings, or change properties. The source lives in `src/server/Authorization.js` and is emitted as the standalone `Authorization.gs` file in the GAS editor. Missing consent stops execution and opens the authorization flow. After granting consent, run it again if necessary. `PORTAL_AUTHORIZATION_CHECK_STARTED` identifies the start of the check. When all permissions are granted, the execution log prints `PORTAL_AUTHORIZATION_GRANTED: All required permissions are granted. No additional authorization is needed.` This confirms the current state, not whether consent was granted before or during the editor launch. Normal automatic property initialization does not invoke this consent flow. Creation blocked by the check logs `SPREADSHEET_CREATION_BLOCKED AUTHORIZATION_REQUIRED`. If the editor reports granted consent but the web app still reports missing consent, verify the executing account and deployment version before retrying. Keep this a personal project and control who can edit its code.

### Icons

Leave `icon` blank to detect the favicon automatically (see [Tool favicons](../README.md#tool-favicons)). Set it when detection finds nothing or the wrong image:

- **Emoji or short text**, such as `📘` or `HS`: shown instead of a favicon, with no image request.
- **Image URL** starting with `https://`: tried first, then automatic detection if it fails to load. `http://` and other schemes are rejected.

Automatic detection cannot see icons that a page declares in its HTML, which is common for signed-in apps. **Settings → Sources → Favicon finder** provides a bookmarklet for this: drag **Find favicon** to your bookmarks bar, open the page, and click the bookmark. It shows the largest `https://` icon the page declares (or the site's `/favicon.ico`) ready to copy into `icon`. It runs in your own tab, so it works on signed-in pages, and it sends nothing anywhere. If dragging from the portal does not work, copy the code from the collapsed section and paste it as the URL of a new bookmark. Some sites' Content Security Policy may block bookmarklets in some browsers.

To find an icon by hand, open the page in your browser, open the developer tools (⌥⌘I on macOS, F12 elsewhere), search the **Elements** panel for `rel="icon"`, and copy the `href` value. A relative `href` must be made absolute with the page's origin.


If others can edit the spreadsheet, note that an `icon` image URL is loaded every time you open the portal (without a referrer). A collaborator could use it to see when you visit, or to send a request to an internal URL from your browser. Automatic favicons only send the hostname of each tool's own URL.

### URL schemes

Links accept any well-formed scheme, for example `https://`, `http://localhost:3000`, `vscode://file/path/to/project`, or `mailto:`. Web URLs keep strict host validation and reject embedded credentials. Malformed values are still reported as row issues.

Whether a link can be opened is decided in the browser:

- `javascript:` and `vbscript:` are always blocked because they run script in the portal page.
- `data:`, `file:`, `blob:`, `about:`, `filesystem:`, and the Windows handler schemes `ms-msdt:`, `search-ms:`, and `ms-officecmd:` (which start programs and have been abused through links) are blocked by default. A scheme added to this list in a later version starts blocked even if you unblocked others. Uncheck them in **Settings → Sources → Blocked URL schemes** to allow them. The choice is saved automatically in the `UNBLOCKED_URL_SCHEMES` User Property and applies immediately without refetching the catalog.
- Every other scheme can be opened. Opening one hands the link to the operating system, so be careful with links from a spreadsheet that others can edit.

Blocked links remain visible: the card or row is grayed out, has no link, and shows the URL as selectable text with a **Blocked scheme** label. Opening an app scheme such as `vscode://` hands the link to the operating system; the browser may ask for confirmation first.

## Tab URLs

Append `#links`, `#inbox-and-tasks`, or `#settings` to the published web app URL to open Links, Inbox & Tasks, or Settings directly. Clicking a tab or navigating the tab bar with the keyboard updates the hash without reloading the page. Browser Back and Forward restore the selected tab, preserving unsaved form text and current tool filters. Reopening or reloading a URL restores the tab, not unsaved form data. An absent or unknown hash opens Links.

GAS uses `google.script.url` and `google.script.history` to read and update the outer web app URL, rather than the sandbox iframe URL. Local previews use the browser history API. Query parameters are preserved; tab changes do not fetch the catalog again. Only the tab name is stored in the URL.

## Display settings

The **Notes** field is a space for personal notes and reminders above the tabs. It preserves entered line breaks, including after saving and reloading, and renders plain text rather than HTML. Its storage key remains `PORTAL_DESCRIPTION`, so existing content is preserved.

The lower part of **Display settings** in the gear tab offers **Language** choices for Japanese and English. Selections are saved automatically in the executing user's `PORTAL_LANGUAGE` User Property. The initial preference is **Automatic (browser)** (`auto`). The first supported language in the browser preference list is used; English is the fallback when neither Japanese nor English is available. Browser preferences commonly reflect OS settings, but users can configure them separately. Existing explicit Japanese or English choices take priority. Select Automatic to resume detection. Detected languages are not persisted as explicit choices. Switching languages preserves filters, the selected tab, and unsaved display settings. Preset headlines and descriptions follow the language; custom text and spreadsheet data retain their original language.

The gear tab lets you edit the portal name, icon, headline, and description. These values are stored in User Properties. Headline and description may be saved as empty strings. Each empty field is hidden; when both are empty, the entire intro area and its spacing are removed from layout. Missing properties still receive the initial defaults. Restoring defaults only changes the form fields; explicitly save to apply them. Theme selections are saved automatically.

| Key | Default |
| --- | --- |
| PORTAL_NAME | My Portal |
| PORTAL_ICON | P |
| PORTAL_HEADLINE | One place to start your workday. |
| PORTAL_DESCRIPTION | Keep your work tools, service links, and daily to-dos in one place. |
| PORTAL_THEME | auto |
| PORTAL_LANGUAGE | auto (browser preference; English fallback) |
| CATALOG_CACHE_SECONDS | 21600 (6 hours) |
| ACTIONS_CACHE_SECONDS | 300 (5 minutes) |
| SPREADSHEET_ID | Empty (configure in Settings) |
| SHEET_NAME | Empty (first sheet) |
| UNBLOCKED_URL_SCHEMES | Empty (all optional schemes blocked) |

In English, the preset headline is “One place to start your workday.” and the description is “Keep your work tools, service links, and daily to-dos in one place.” Existing values that exactly match either preset are treated as presets for display, without rewriting stored values.

Choose from the 24 standard [Skeleton](https://www.skeleton.dev/) palettes. **Cerberus** is the default. Appearance is selected separately: **Automatic**, **Light**, or **Dark**. Automatic follows the device’s `prefers-color-scheme` without changing the selected palette. Both choices save automatically through the existing per-user theme preference.

Palettes are imported directly from the pinned Skeleton package in `src/browser/themes.css`. Portal text and filled-control foregrounds use black or white to preserve readable contrast; palette hues and surface shades remain upstream. The theme list lives in `src/shared/themes.js`. Removed palette names fall back to Cerberus / Automatic. Favicons use the same palette source and share an image across light and dark appearances.

Theme names saved before v0.3.0 (Tsuyukusa, Sakura, and the other earlier palettes) are treated as Automatic without rewriting the stored value. Choose a theme again to replace it.

## Catalog loading and cache

The initial catalog is embedded as escaped JSON in the HTML response. The browser renders it directly without an initial `google.script.run` round trip. A live catalog read for a named sheet makes one Sheets API values request. When the sheet name is empty, it first fetches sheet titles and indices to resolve the first sheet, then reads values. Metadata is also fetched after a failed values request to retain useful missing-sheet diagnostics. Reordering tabs takes effect after cache expiry or **Fetch latest** when using the first-sheet fallback. Cache hits do not call Sheets.

**Links cache duration**, in **Settings → Links**, offers Disabled, 5 minutes, 1 hour, and 6 hours (default). Changes are saved automatically to the executing user's `CATALOG_CACHE_SECONDS` User Property and apply to the next load. Initialization preserves existing values. These settings do not belong in Script Properties or in the "gas-portal" configuration in package.json.

**Fetch latest** in Links bypasses the cache, reads the spreadsheet, and replaces the cached entry. Search, remaining selected tags, and the Cards/List choice are preserved. The retrieval time identifies the data snapshot; a Cached label indicates reuse. A normal browser reload may reuse the cache. Fetch latest also retries failed loads. Initial asynchronous loading and refresh use the spinning refresh icon without visible loading messages; failures and empty results remain explicit.

Only validated catalog fields and row issues are stored in GAS User Cache, separated by spreadsheet ID and sheet name. Unknown spreadsheet columns are excluded. User Cache belongs to the executing user (the deployer in this personal app), not independently to each visitor. Errors are never cached. A failed forced refresh is reported instead of silently returning old data. Concurrent cache fills are serialized with a user lock.

The [GAS Cache service](https://developers.google.com/apps-script/reference/cache/cache) supports at most six hours and 100 KB per entry, and may evict data sooner. Oversized catalogs or unavailable cache storage fall back to live reads. Shortening the selected duration checks the stored retrieval time; increasing it does not extend the Cache service's original expiry. Cache keys are versioned in source and must change when the cached catalog format or interpretation changes. Access checks against Sheets run on live reads; cached data may remain until expiry or Fetch latest after a sharing change.

The local preview simulates caching with mock data and browser storage. It never reads Sheets and is not a production performance benchmark. The initial page request still executes GAS. Cached catalog data is read while generating the HTML; a cache miss reads Sheets before sending that response. This removes the second data-fetch round trip rather than merely hiding a loading indicator. Initial read failures are embedded as errors so Settings and Fetch latest remain available. Fetch latest uses the existing asynchronous RPC.

## Local preview

Start with `npm run preview -- --port 4174`. The server binds only to localhost. If the port is occupied, startup fails instead of silently choosing another port. No authentication or Google access is required.

- `/`: mock links
- `/mobile.html`: a 390px viewport
- `/?state=empty`: empty catalog
- `/?state=invalid`: invalid entries
- `/?state=config`: spreadsheet configuration error
- `/?state=error`: request failure

Language selections also persist in preview localStorage, separately for each consumer directory.

Spreadsheet settings are simulated too: saving an ID or URL still displays mock data and never fetches that spreadsheet. **Create new spreadsheet** saves a fake ID in preview storage and keeps displaying the mock catalog after reload; it never creates a Google file. The saved fake ID also blocks repeated creation until disconnected. Preview settings stay in that browser's localStorage and do not affect production or consumer projects in other directories.

## Troubleshooting

- `invalid_grant` / `invalid_rapt`: run `npm run login` from the consumer directory and select the correct Google account to reauthenticate.
- No versioned deployments: create the first web app deployment in the GAS console.
- Multiple versioned deployments: inspect `npx portal deployments` and select the target with `npx portal deploy --deployment-id ID`.
- Configured deploymentId not found: check whether it belongs to another project or has been deleted. The CLI does not switch to a different ID automatically.
- Direct clasp access: run `npx clasp --project .portal/.clasp.json --user PROFILE COMMAND`, explicitly selecting both the project and authentication profile.

## Gmail unread mail

Gmail is optional and **disabled by default**. Enable it in **Settings → Sources → Gmail**, above Slack and GitHub. There is no separate Gmail subtab. The integration uses the Google account executing the web app; no manually entered token or extra connection is needed. In an owner-executed deployment, this is the deploying account, so keep a personal portal private.

### Setup and authorization

1. Build and deploy the updated code with `npm run ship`. The manifest adds the Gmail v1 advanced service and **`https://www.googleapis.com/auth/gmail.metadata`**. This scope permits reading message headers and labels across the account; it does not grant message-body or attachment access, or write access. Unread-only filtering is an application rule, not an OAuth restriction.
2. When additional authorization is needed, open **Authorization.gs** in the GAS editor, run **`authorizePortal`**, grant access, then reload the portal. CLI deployment alone does not grant consent. For a standard Google Cloud project, enable the **Gmail API** there if necessary. Workspace policies may restrict Gmail API access.
3. In **Settings → Sources → Gmail**, enable **Show unread Gmail in Inbox & Tasks**, choose the maximum unread message count, and save. The limit offers **10, 20 (default), 50 or 100**. Settings are stored in the executing user's `GMAIL_SETTINGS` User Property; no manual property initialization is needed.
4. Open **Inbox & Tasks**. Each unread message is one row, with its subject, sender and received time. Click the row to open its thread in Gmail. Multiple unread messages in one thread can produce multiple rows. The portal never marks messages read or modifies mail; opening Gmail itself may mark them read.

### Results and caching

- The query uses the **UNREAD** label, excludes spam and trash, and includes archived unread mail. Drafts are omitted. Subjects and senders are plain text, capped at 500 characters each; mail bodies, previews and attachments are neither requested nor returned. Missing subjects use **(No subject)**.
- Gmail joins the existing list, text search, service/type filters and single refresh button. Results sort by received time alongside other services' timestamps. Filtering searches the loaded subject, not the mail body. No Gmail request occurs during page rendering; reads start asynchronously when Inbox & Tasks opens.
- The existing **Inbox & Tasks cache duration** applies (five minutes by default). User Cache holds only the displayed metadata. Settings changes rotate the cache revision; **Fetch latest** bypasses every service cache. The list does not poll in the background, so reading mail elsewhere changes the portal after expiry and a subsequent load, or an explicit refresh. Disabling Gmail stops reads and removes its rows; it does not revoke previously granted OAuth consent.
- Profile and unread-ID requests start in parallel. Message headers are fetched in batches of ten concurrent requests, up to the selected limit. A next-page token produces an additional-results notice without downloading another page. Counts mean loaded messages, not a mailbox-wide unread total. Messages deleted or marked read between listing and header retrieval are skipped.
- Partial failures preserve successful rows with a warning and are not cached. Authorization errors, denied API access and rate limits are shown distinctly from an empty mailbox. There is no automatic retry loop. Raw API error details and OAuth tokens are never returned or logged.

### Offline preview

Enable Gmail in local preview settings to show three fictional messages. Preferences persist in preview localStorage; no Google connection is made. Query scenarios are `?gmail=ready#inbox-and-tasks`, `empty`, `more`, `partial`, `unauthorized`, `forbidden`, `rate-limit`, and `error`. A saved preview preference takes precedence over the scenario's initial enabled state. Combine with `github=…` and `slack=…` to inspect mixed results.

References: [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [message listing](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list), and [metadata retrieval](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get).

## GitHub Inbox & Tasks

The first integration targets **GitHub.com**, including GitHub Enterprise Cloud organizations hosted on GitHub.com. Enterprise Server and Enterprise Cloud data-residency domains (`*.ghe.com`) are not supported yet. The portal only reads data: open the original issue or pull request to act. Unread notifications, marking notifications read, and issue/PR updates are outside this integration.

### Connect an account

1. Deploy the updated app with `npm run ship`. The manifest adds `script.external_request` so GAS can call GitHub. If Google requires additional consent, authorize as the deploying user; run `authorizePortal` in the GAS editor if necessary. Web-app visibility and execution identity remain unchanged.
2. Create a **fine-grained personal access token** in [GitHub Settings](https://github.com/settings/personal-access-tokens/new). Select the intended resource owner, the repositories you need, and an expiration date. Set repository permissions **Issues: Read-only** and **Pull requests: Read-only**; **Metadata: Read-only** is included automatically. Repository selection and API permissions are separate: selecting a repository does not grant access to all of its data. These two read permissions are the recommended configuration; successful searches with Metadata alone are not a reliable indication of complete access. Organization approval and policies may apply. Do not add write permissions. The portal's owner field only filters results, and the app cannot verify that a supplied token has no additional privileges.
3. In portal **Settings → Sources → GitHub → Add connection**, enter the token and optionally an organization/account owner to filter searches. Connection names use `owner@login`, or `*@login` when the filter is blank (`*` means no owner filter). The portal validates the authenticated GitHub identity; the displayed `@login` comes from GitHub, not from a manually entered username. Classic PATs are deliberately rejected.
4. Leave the owner filter blank to include all repositories the token can access, including public repositories belonging to other owners. For example, use a company token with the company organization filter, and a personal token without a filter. Company public items may be fetched by both connections; the combined list deduplicates them. Repository-level filters and custom connection names are not supported. The owner filter does not change permissions: configure the token itself to restrict access.
5. Save and open **Inbox & Tasks**. You can configure up to three independent connections for accounts or resource owners. Fine-grained tokens are limited to one resource owner, so create separate connections when needed. For private company repositories, choose the company organization as Resource owner; choosing your own account does not include them merely because you are a member. Public repositories remain readable regardless of the selected owner. The portal’s owner filter only narrows searches and cannot expand the token’s access. A token awaiting organization approval can read only public resources until approved. Blank token input while editing preserves the saved token; entering a replacement rotates it. The input is cleared after submission.

Tokens and connection settings are stored only in the executing user's `GITHUB_CONNECTION_<id>` User Properties. No token defaults are created by initialization. Tokens are never returned by the connection-list RPC, embedded in page HTML, cached with results, or logged. The browser necessarily sends a newly entered token to GAS once over its authenticated RPC. GAS User Properties are not a dedicated secret vault: anyone able to deploy code that runs as that user can access them. Keep personal deployments private and limit project/repository write access.

**Disconnect** removes the connection's stored token and cache. It does not revoke the token on GitHub; revoke unused tokens there yourself. Tokens expire and organization policies can revoke access. A new token is required if an existing one expires.

### Results, caching, and limits

- Four categories are searched separately: assigned open issues, directly requested PR reviews, team-requested PR reviews, and changes requested on your own open PRs (`is:open is:pr author:LOGIN review:changes_requested`). The same GitHub issue or PR is displayed once across all categories and connections, with its reason labels merged. Service identifiers keep items from different services distinct. Connection labels stay in Settings and error details.
- Changes requested means GitHub’s explicit **Request changes** review status. Ordinary comments asking for edits are not detected. A PR may remain in this state after you push a fix until its review status changes. The same optional owner filter applies; leave it blank to include your PRs in other owners’ accessible repositories.
- GitHub rows use update time in the unified list and show the service, repository, item number, update time, reason labels, and original link. Team results use GitHub's team-review qualifier; visibility depends on the authenticated account/token and organization policies. They are not inferred from display names or arbitrary mentions.
- Loading uses a rotating refresh icon (disabled animation with reduced-motion preferences), without a loading message. Existing results stay visible during refresh. Successful empty results use the same empty-state panel as Links; failures remain explicit errors.
- Inbox & Tasks loads asynchronously only after its tab is opened. All connection RPCs start together, and the list updates once after every connection succeeds, fails, or reaches the 60-second batch timeout. The single refresh button bypasses every connection cache. Previous results, count, and retrieval time remain visible while refreshing. Opening Settings loads connection metadata but does not fetch issue/PR data. Initial connection loading uses an icon-only spinner in Settings and the shared refresh spinner in Inbox & Tasks. No GitHub network requests occur in `doGet`.
- The authenticated GitHub login is verified and saved when a connection is created or edited. Live task reads use that saved login and call the four searches directly, without another `/user` request. Search responses detect revoked/expired credentials. Connection metadata comes from User Properties, with no GitHub request. Inbox & Tasks stays asynchronous and is never embedded in the page HTML.
- GAS User Cache stores sanitized results using **Settings → Sources → Inbox & Tasks cache duration**: Disabled, 1 minute, 5 minutes (default), 15 minutes, 30 minutes, 1 hour, or 6 hours. This automatically saved `ACTIONS_CACHE_SECONDS` User Property applies to every Inbox & Tasks service and connection, independently of the catalog setting. Shorter durations check the original retrieval time; longer durations cannot extend an existing Cache service expiry. Disabled bypasses reads and writes. Entries are keyed by connection and a revision replaced on credential/filter changes. The refresh icon forces a live read. Cached results may remain visible until expiry or refresh after access is revoked. The visible list is a snapshot and does not poll in the background. The toolbar timestamp is the oldest successful connection retrieval time, rather than the time the browser finished refreshing.
- Each category fetches at most two pages of 100 items (200 per category, at most eight search requests per live refresh), below GitHub Search's 1,000-result ceiling. Pagination is bounded to keep GAS execution time and API usage predictable. Displayed counts always mean **items shown**, not a global or guaranteed-complete task count. API `incomplete_results`, truncation, changing totals, duplicates across pages, invalid entries, and failed pages produce an explicit partial-result notice and a GitHub search link.
- After a batch settles, successful categories remain visible when another category or connection fails. A single expandable notice identifies the affected connections and categories. Failed connections do not retain their previous data after the batch completes; late responses from timed-out or removed connections are ignored. Expired/invalid credentials, forbidden access, rate limiting, invalid filters, transport failures, and partial results are shown distinctly from an empty successful result. Failed responses are not cached; a failed forced refresh does not silently reuse stale data. There are no automatic retries against rate limits.
- Search reflects the repositories visible to the token. GitHub can omit inaccessible repositories, especially with broad owner/global filters; a successful empty search is **not proof** of organization-wide access. Check token resource owner, repository selection, approval, and organization/SSO policies when expected items are missing; do not broaden permissions merely because a search is empty.

### Offline preview

Local preview starts with a fictional GitHub connection and task list. It never contacts GitHub. Use the literal `demo` in the token field to test adding a connection; never enter a real credential. Mock connections are kept in memory and reset on reload. No token is persisted to localStorage or fixtures.

Use `/?github=multiple#inbox-and-tasks` for overlapping connections with one extra personal issue, `/?github=multiple-error#inbox-and-tasks` for a failing second connection, `/?github=disconnected#inbox-and-tasks`, `/?github=empty#inbox-and-tasks`, `/?github=partial#inbox-and-tasks`, `/?github=unauthorized#inbox-and-tasks`, `/?github=rate-limit#inbox-and-tasks`, or `/?github=error#inbox-and-tasks` to inspect each state. Preview results are fixtures, not a live integration test.

References: [GitHub Search API](https://docs.github.com/en/rest/search/search#search-issues-and-pull-requests), [review search qualifiers](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests#search-by-pull-request-review-status-and-reviewer), [authenticated user](https://docs.github.com/en/rest/users/users#get-the-authenticated-user), and [fine-grained PAT setup and limitations](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

## Inbox and task filtering

The shared search field filters loaded inbox subjects, task titles, and context locally without API requests. Inbox and Tasks have separate visible / loaded counters. Gmail unread messages are grouped in the expandable Inbox area; GitHub work items and Slack To-dos appear below in Tasks. There are no type-filter controls. Service icons and reason badges identify each item.

Links has its own text search and AND-based tag filtering. Both views preserve their filters during refreshes and language changes, and display the oldest successful retrieval time alongside their refresh button. Errors and additional-result notices remain visible regardless of filtering.

## Slack To-dos

Slack message-backed To-dos appear under **Inbox & Tasks → Tasks**, alongside GitHub. Bookmarks are not collected. The portal searches `is:to-do` and reads each candidate using `conversations.history` or `conversations.replies`; it never uses browser sessions or `saved.list`.

### Connect a workspace

1. Create an app in [Slack Apps](https://api.slack.com/apps). Under **OAuth & Permissions → User Token Scopes**, add `search:read` for search, plus `channels:history` (public channels), `groups:history` (private channels), `im:history` (DMs), and `mpim:history` (group DMs) for the conversation types you use. Install or reinstall the app after changing scopes; administrator approval may be required. `im:read` is not needed for this integration.
2. Copy the **User OAuth Token** (`xoxp-`). Bot tokens, browser tokens, and cookies are not supported. These scopes can read accessible messages beyond To-dos. No Slack data is modified.
3. Open **Settings → Sources → Slack → Add connection** and save the token. `auth.test` verifies identity once at save time. Up to three workspace/user connections are supported. Editing can retain the existing token; its final two characters are the only credential information returned to the browser. Replace expired or revoked tokens manually.

Tokens live in the executing user's `SLACK_CONNECTION_<id>` User Properties and are excluded from HTML, result caches, and logs. Code running as that user can read User Properties. Disconnecting deletes the local credential and result cache, without revoking the Slack app.

### Bounded search and completion state

- The window is the last **31 days of message posting time**, not To-do registration time. An old message added to To-dos today can be outside the window. The day-granular search includes a boundary day; the server enforces the exact rolling window before requesting details.
- Each connection checks at most **200 candidates**, newest first, within the posting-time window. The limit is fixed and includes completed To-dos; there is no setting or User Property for it. Completed entries are excluded without backfilling. Reaching the cap shows an informational notice that older results remain unchecked.
- Detail responses are matched to the exact message timestamp, including replies whose parent timestamp appears only in the search permalink. `saved.todo_state=to_do` is displayed; `completed` is excluded. Missing or unrecognized state is displayed as **To-do (status unknown)**, never inferred from message text. This field was verified with app-issued user tokens but is not a documented stable completion-state contract.
- There are at most two search pages and one detail request per unique candidate. Rate limits and revoked authorization stop further detail requests without retries. Detail processing also stops starting requests after 25 seconds; unchecked candidates remain unknown with a partial-result warning. A slow individual request can exceed this soft budget.
- Search coverage is not guaranteed to match Slack's dedicated To-dos view, including Slack Connect messages. Files and manually entered To-dos are not included. Counts represent the displayed subset, not a total of all outstanding Slack tasks.
- Titles are plain text up to 500 characters. Rows link to Slack and show the workspace, channel, and posting time. No calls run during `doGet`; connection metadata uses User Properties without repeating `auth.test`.
- The shared **Inbox & Tasks cache duration** applies (five minutes by default). Result caches are per user, connection revision, and limit. Failed or partial retrievals are not cached. The shared refresh button bypasses the cache for all services; there is no background polling.

### Diagnostics

A collapsed **Diagnostics** section below Tasks shows the latest batch per connection. Slack reports received search matches, eligible To-dos, completed/incomplete/unknown states, and remaining search results when known. Excluded or duplicate records are counted separately. Unknown totals stay unknown, including failed searches or inconsistent pagination. Search totals come from Slack and can include the boundary day used by the date query; they are not a count of all outstanding tasks.

These aggregates travel with the result snapshot and its existing cache; they are not written to User Properties or a persistent log. Cached snapshots retain their original retrieval time. Refresh replaces the snapshot; text filtering does not alter its diagnostics. Tokens, message bodies and raw API responses are never included.

### Offline preview

Preview includes a fictional Slack connection and two To-dos. It never contacts Slack or retains tokens; only `demo` is accepted in the token field. Query scenarios include `slack=disconnected`, `empty`, `unknown`, `more` (205 fictional candidates), `partial`, `unauthorized`, `rate-limit`, `scope`, and `error`. For example, `/?slack=unknown#inbox-and-tasks` shows an item with unknown completion state.

## Slack saved messages in Links

Each Slack connection adds one workspace card at the start of Links. Its main URL opens the workspace; its child links open personal saved messages. The app searches `is:saved` for at most 200 messages, newest posts first, without a date limit or per-message detail requests. Search coverage can differ from Slack's Saved view. Long labels are shortened to 48 characters and show up to 500 characters in a tooltip; search includes the longer excerpt. Large lists scroll within their card.

The same credentials serve saved messages and To-dos. Saved messages use the Links cache duration, independently of Inbox & Tasks. Links refresh fetches spreadsheet data and saved messages; failures do not hide successful sources. Connection changes invalidate their saved-message cache, and late responses cannot restore disconnected cards.

## Settings navigation

Settings has three subtabs: **Appearance**, **Sources**, and **Calendar**. Sources starts with independent Links and Inbox & Tasks cache durations, followed by **Links spreadsheet**, **Gmail**, **Slack**, and **GitHub**. The cache controls appear side by side, stacking in compact mode; their changes save automatically. Calendar cache changes use the Calendar form's **Save changes** button.

The spreadsheet section ends with collapsed **Advanced settings** for blocked URL schemes and the favicon finder. Switching tabs or opening disclosures preserves form drafts and each control's save behavior.

Main routes are `#links`, `#inbox-and-tasks`, and `#settings`. Settings routes are `#settings/appearance`, `#settings/sources`, and `#settings/calendar`; old settings routes are not aliases. Browser back/forward works in both GAS and preview. Arrow keys and Home/End navigate the focused tab row.

When editing GitHub or Slack connections, the token field is read-only and shows a fixed mask plus its last two characters. Only those two characters are included in connection metadata; saved tokens are never returned in full. Choose **Replace token** to enter a replacement. An empty replacement preserves the existing token. Local preview shows a fictional suffix (`mo`).


## Google Calendar

The header calendar button opens a compact schedule panel available across Links, Inbox & Tasks and Settings. It always reserves space in the page, beside the main content on screens wider than 760px and above it on narrower screens. It never overlays the content. At wider stacked sizes, card details use a horizontal layout; at phone widths, source and links share a compact row. Search controls in Tools and Actions stay beside the input when the main content has enough room, independently of whether the panel is open. The open/closed preference is saved in that browser; the calendar opens by default at every screen size.


### Setup and authorization

1. Build the updated package and deploy with `npm run ship` in the consumer project. The manifest adds `https://www.googleapis.com/auth/calendar.readonly` and the Calendar v3 advanced service. No Calendar write permission or manually entered token is needed. GAS supplies the executing user's OAuth token; this works with personal Google accounts as well as Workspace accounts.
2. Authorize the new read-only permission with the account that executes the web app. If consent does not appear, open the GAS editor and run `authorizePortal` with that account, then reload the portal. CLI deployment alone does not grant consent.
3. Open **Settings → Calendar**, optionally choose **Load calendars**. Select between one and five readable calendars; the default is the primary calendar. Shared calendars can be selected when they appear in that account's calendar list.
4. Choose the cache duration and optional upcoming-event notice, then **Save changes**. These fields save together. Close the panel with the header button to stop automatic event fetching. Loading calendar choices remains available in Settings.

For an Apps Script default Cloud project, the declared advanced service enables the Calendar API automatically. If your script uses a standard Google Cloud project, enable **Google Calendar API** in that project if necessary. See Google's [advanced service setup](https://developers.google.com/apps-script/guides/services/advanced#requirements).

Settings are stored as validated JSON in the executing user's `CALENDAR_SETTINGS` User Property. `CALENDAR_REVISION` invalidates prior cache entries on changes. Display names for the selected calendars are stored separately in `CALENDAR_NAMES`, restored without Google API calls, and updated with **Load calendars** or when saving a newly selected calendar. Missing names fall back to the calendar ID; names do not indicate authorization status. Initialization only supplies missing defaults (primary calendar, five-minute cache, notices disabled); it does not request events. As with the other integrations, executing as the deployer means the deployer's calendar is used. Keep personal deployments restricted to yourself.

### Schedule behavior

- Today's boundary and displayed times use the browser's IANA time zone, including daylight-saving changes. Date and time-zone text are omitted from the panel to save space. Recurring events are expanded for that day. Cancelled events, invitations explicitly declined by the executing user, and working-location entries are omitted.
- Current and next appointments show their time, duration and a two-line title. The next appointment has a localized **Next** / **次の予定** label; when notices are enabled, it counts down as **In 3′**, **In 2′**, then **In 1′** in English, or **3分後に開始** through **1分後に開始** in Japanese. Next and current remaining-time labels make one short glitch transition when their value changes, with no continuous text animation. The existing local clock schedules remaining-minute boundaries without extra API calls. Reduced-motion preferences disable the transitions. The appointment with the latest end time appends `~ HH:mm` after the usual start time and duration, even if it starts before another overlapping appointment. Later appointments show compact time/duration; past appointments are thin, faded strips. While inspecting past appointments or All day, compact targets grow to 28px and previously inspected past cards stay expanded so subsequent targets do not jump upward. Moving the pointer or keyboard focus to a current or future row, or leaving the schedule, resets this temporary expansion; an explicitly pinned All day card stays open. Hover expands a row after 180ms of dwelling; brief pointer passes are ignored. The same delay applies to All day and the initial past-row inspection state. Keyboard focus and touch remain immediate. The full title is available in its tooltip and accessible label. Reduced-motion preferences disable expansion animations.
- All-day events share one compact **All-day events · count** card. Hover or focus expands its titles; **Pin** keeps it expanded until **Unpin** collapses it. Touch users can tap the heading or Pin. The all-day Pin button appears only while the card is expanded. Its collapsed height matches past appointments. Pinning lasts until the page is reloaded. Pin and unpin use the bundled Lucide pin and pin-off icons. Overlapping busy intervals are combined only for calculating free time, while their appointments remain separate. Free-time blocks appear only between known busy intervals; an all-day busy event prevents these blocks. Transparent events do not block time. Partial results never generate free-time blocks. Free time refers only to the selected calendars.
- Colors use an event's custom Google Calendar color when available, otherwise its calendar color. Shared invitations found in multiple selected calendars are deduplicated by iCalendar UID and start time. Event links and Google Meet links open separately; the portal never updates appointments.
- Live reads retrieve at most 1,000 events per selected calendar. Truncation or errors retain retrieved appointments with a notice, instead of claiming the day is empty. Only titles, times, source names, colors and safe Google links enter the result; descriptions and attendee lists are excluded.

### Cache and clock

Calendar data loads asynchronously when the panel is open, independently of Links and Inbox & Tasks. **Calendar cache duration** offers Disabled, 1 minute, 5 minutes (default), 15 minutes, 30 minutes, 1 hour, and 6 hours. GAS User Cache is keyed by executing user, settings revision, date and time zone. **Fetch latest** bypasses it. Failed/partial responses are not cached; unavailable or oversized cache storage falls back to live reads. Permission changes can remain invisible until expiry or a forced refresh.

Current appointments show the elapsed portion from the top down in the same pale background as free time. Card durations and countdowns use the compact prime notation (`30′`); accessible names retain localized minute words. Remaining minutes read **12′ left** in English or **残り12分** in Japanese and use the same 12px type size as the leading duration and appear at the bottom right in a darker, theme-aware shade of the event color. They remain readable as the remaining fill shrinks, including the final minute. Each overlapping appointment has its own countdown, also available in its tooltip and accessible name. The portion uses the full appointment duration, including events spanning midnight. It updates with the existing local clock, without additional requests.

**Nearby** expands the current and next appointments. **Free** expands free-time blocks instead and reduces all other timed appointments, including the current and next ones, to thin strips without visible labels or badges. Hover, focus or touch can still inspect those appointments. **All** expands every timed appointment, free-time block and the all-day group; switching back restores the other modes and any explicit all-day pin. None of the modes removes entries, and hover/focus/touch can still expand other rows. The segmented control shares a row with refresh and uses the same component as Cards/List. Switching modes is entirely local and resets temporary expansion. Calendar settings remain available through **Settings → Calendar**.

While the page is visible, a local clock reclassifies events at start/end/notice boundaries and at least once per minute, without requesting Google. An open panel also refreshes expired data (every five minutes when caching is disabled). Hidden tabs pause this timer; returning to the page or changing days re-evaluates state and refreshes when necessary. Failed reads retry after approximately a minute while visible and open, with a manual retry always available. A failed forced refresh reports the failure and clears the previous snapshot.

Optional notices highlight the next scheduled appointment's own card one, two, three, five, ten or fifteen minutes before it starts. A stronger 1.8-second heartbeat, with two peaks followed by a pause, brightens the card surface and its surrounding glow; text stays readable and the page remains interactive. Simultaneous next appointments are highlighted together. The pulse stops at the start time and is disabled by the OS reduced-motion preference, which retains static emphasis. A small **bell-off** button beside the countdown silences only that appointment. Its countdown remains visible, and other appointments still notify. Silence lasts for the page session, survives data refreshes and panel reopening, and is keyed by appointment ID and start time; a rescheduled appointment can notify again. Nothing is written to user settings or Google Calendar. There is no dialog or separate inserted notice. **Preview notice** shows one fictional next-appointment card using unsaved timing, without saving or contacting Google; disabled timing uses three minutes for the sample. Notices are disabled by default. They do not send OS notifications, play sounds or run when the browser is closed; hidden tabs and device sleep can delay them. Use Google Calendar's notifications for reliable reminders.

### Offline preview

Preview enables a fictional calendar by default and never contacts Google. Its relative-time fixtures include past, current, next and later appointments, free time and an all-day event. Calendar settings persist in preview localStorage independently of production. Use the header calendar button if the panel was previously closed.

| URL parameter | Scenario |
| --- | --- |
| `?calendar=overlap` | Concurrent current appointments |
| `?calendar=all-day` | All-day busy event, with no free-time blocks |
| `?calendar=pulse` | Next appointment in two minutes; enables a three-minute notice unless preview settings were saved |
| `?calendar=alert` | Next appointment in four minutes; choose a five-minute notice in Settings |
| `?calendar=empty` | No events today |
| `?calendar=partial` | Partial retrieval, with free-time blocks suppressed |
| `?calendar=unauthorized` | Missing authorization and recovery instructions |
| `?calendar=error` | Retrieval failure |

UI interactions can be reviewed locally. Actual consent, calendar selection, event colors and data access must be verified after deploying with your Google account.
