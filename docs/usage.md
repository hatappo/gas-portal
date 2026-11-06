# Usage guide

## Initial setup

1. Using the Google account for this work environment, create a standalone Apps Script project. You can create its spreadsheet from the portal after deployment.
2. Install gas-portal in a consumer directory and run `portal init --script-id ID --auth-profile work-a`.
3. Enable the Apps Script API in the account's Apps Script settings. Run `npm run login` and select the correct account. Verify it with `npx portal status`.
4. Upload the code with `npm run push`.
5. Property defaults are initialized automatically. If authorization is needed, open the GAS editor with the deploying account, select `initializeProperties`, and run it to explicitly request missing consent. Review the authorization prompt; run the function again after consent if the first execution stops.
6. If you will use an existing spreadsheet, prepare its header row and data as described below. Otherwise, the portal can create an empty table for you.
7. Create the first deployment with **Deploy → New deployment → Web app**. Set execution to yourself and access to only yourself.
8. Open the published URL and select **Settings → Spreadsheet**. Choose **Create new spreadsheet** with an empty ID to create and connect a new file. Alternatively, enter an existing spreadsheet ID or Google Sheets URL, optionally enter the sheet name, and save. Select **Reload portal** to use the source. For subsequent updates, run `npm run ship` (or `npm run push` followed by `npm run deploy`). A successful deploy saves the selected deploymentId if none was configured.

Use separate GAS projects and spreadsheets for each environment, with access restricted to their owner. Run initialization as the deploying account because User Properties belong to the executing user. Initialization adds only missing keys and preserves existing values, including empty strings. The legacy `initializeScriptProperties` function remains available for compatibility.

To update application code, upgrade the package, check build / preview, then push / deploy. Changes to spreadsheet data or display settings do not require redeployment.

## Spreadsheet

**Settings → Spreadsheet** stores `SPREADSHEET_ID` and `SHEET_NAME` in the executing account's User Properties. The ID field accepts a raw ID or an HTTPS editor URL on `docs.google.com`, such as `https://docs.google.com/spreadsheets/d/ID/edit?gid=123#gid=123` (including `/spreadsheets/u/0/d/ID/edit`). Saving normalizes the URL to its ID. Published `/d/e/` links and other origins are rejected. The URL's `gid` is ignored; select a tab by its name instead.

Leave the sheet name empty to use the first sheet by tab order, including a hidden first sheet. An explicitly configured name that does not exist produces an error rather than falling back to another sheet. Leave the ID empty to disconnect the source. Save, then reload the portal to use the new settings; saving does not verify access or modify spreadsheet permissions. Reloading also discards unsaved form edits. The footer link follows the configured spreadsheet.

On the first page load, catalog request, or `initializeProperties` run, missing User Properties receive defaults. Existing values, including empty strings, are preserved. Script Properties are neither read nor copied. If the source was previously configured only in Script Properties, enter it once in **Settings → Spreadsheet** after updating. Already configured User Properties continue to work.

### Create a new spreadsheet

**Create new spreadsheet** is available only when no ID is saved and the ID input is empty. The server checks the saved User Property again under the same lock used for source settings. Any nonempty saved ID, even an invalid one, stops creation before calling Sheets. Clearing the input alone does not disconnect an existing source; save the empty ID first if you intend to create a replacement.

Creation makes a file named `<portal name>`, with one `Tools` sheet and a native Google Sheets table named `PortalLinks`. It contains a header plus 100 empty entry rows and exactly seven columns in this order: `id`, `hidden`, `tags`, `icon`, `name`, `url`, `description`. Columns beyond G do not exist. `hidden` is a checkbox; all other columns are text, including URLs and IDs with leading zeros. The header is frozen, column widths are set, and each header cell has a note describing its format. Notes follow the current portal language at creation, including how a blank `id` makes a related link. Explicit English or Japanese takes priority; Automatic uses the browser language, with English as fallback. Changing the portal language later does not rewrite existing notes. The table header uses a calm blue (`#71a4d9`) with dark text. Add table rows in Sheets as needed.

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

When upgrading to this feature, push and deploy the new code and authorize the added scope as the deploying account. CLI deployment alone does not confirm that the new consent has been granted. Creation checks authorization before calling Sheets and shows editor instructions when consent is missing. If authorization is required, push the latest code, reload the GAS editor, and run `initializeProperties` with that account. This editor entry point calls `ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL)` before acquiring a lock or changing properties. Missing consent stops execution and opens the authorization flow. After granting consent, run it again if necessary. `PORTAL_AUTHORIZATION_CHECK_STARTED` and `PORTAL_AUTHORIZATION_GRANTED` identify the check and successful authorization in the execution log. Normal automatic property initialization does not invoke this consent flow. Creation blocked by the check logs `SPREADSHEET_CREATION_BLOCKED AUTHORIZATION_REQUIRED`. If the editor reports granted consent but the web app still reports missing consent, verify the executing account and deployment version before retrying. Keep this a personal project and control who can edit its code.

### Icons

Leave `icon` blank to detect the favicon automatically (see [Tool favicons](../README.md#tool-favicons)). Set it when detection finds nothing or the wrong image:

- **Emoji or short text**, such as `📘` or `HS`: shown instead of a favicon, with no image request.
- **Image URL** starting with `https://`: tried first, then automatic detection if it fails to load. `http://` and other schemes are rejected.

Automatic detection cannot see icons that a page declares in its HTML, which is common for signed-in apps. **Settings → Tools & Links → Favicon finder** provides a bookmarklet for this: drag **Find favicon** to your bookmarks bar, open the page, and click the bookmark. It shows the largest `https://` icon the page declares (or the site's `/favicon.ico`) ready to copy into `icon`. It runs in your own tab, so it works on signed-in pages, and it sends nothing anywhere. If dragging from the portal does not work, copy the code from the collapsed section and paste it as the URL of a new bookmark. Some sites' Content Security Policy may block bookmarklets in some browsers.

To find an icon by hand, open the page in your browser, open the developer tools (⌥⌘I on macOS, F12 elsewhere), search the **Elements** panel for `rel="icon"`, and copy the `href` value. A relative `href` must be made absolute with the page's origin.


If others can edit the spreadsheet, note that an `icon` image URL is loaded every time you open the portal (without a referrer). A collaborator could use it to see when you visit, or to send a request to an internal URL from your browser. Automatic favicons only send the hostname of each tool's own URL.

### URL schemes

Links accept any well-formed scheme, for example `https://`, `http://localhost:3000`, `vscode://file/path/to/project`, or `mailto:`. Web URLs keep strict host validation and reject embedded credentials. Malformed values are still reported as row issues.

Whether a link can be opened is decided in the browser:

- `javascript:` and `vbscript:` are always blocked because they run script in the portal page.
- `data:`, `file:`, `blob:`, `about:`, `filesystem:`, and the Windows handler schemes `ms-msdt:`, `search-ms:`, and `ms-officecmd:` (which start programs and have been abused through links) are blocked by default. A scheme added to this list in a later version starts blocked even if you unblocked others. Uncheck them in **Settings → Tools & Links → Blocked URL schemes** to allow them. The choice is saved automatically in the `UNBLOCKED_URL_SCHEMES` User Property and applies immediately without refetching the catalog.
- Every other scheme can be opened. Opening one hands the link to the operating system, so be careful with links from a spreadsheet that others can edit.

Blocked links remain visible: the card or row is grayed out, has no link, and shows the URL as selectable text with a **Blocked scheme** label. Opening an app scheme such as `vscode://` hands the link to the operating system; the browser may ask for confirmation first.

## Tab URLs

Append `#tools`, `#actions`, or `#settings` to the published web app URL to open Tools & Links, Action Items, or Settings directly. Clicking a tab or navigating the tab bar with the keyboard updates the hash without reloading the page. Browser Back and Forward restore the selected tab, preserving unsaved form text and current tool filters. Reopening or reloading a URL restores the tab, not unsaved form data. An absent or unknown hash opens Tools & Links.

GAS uses `google.script.url` and `google.script.history` to read and update the outer web app URL, rather than the sandbox iframe URL. Local previews use the browser history API. Query parameters are preserved; tab changes do not fetch the catalog again. Only the tab name is stored in the URL.

## Display settings

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
| SLACK_BOOKMARK_LIMIT | 20 (per Slack connection) |
| SPREADSHEET_ID | Empty (configure in Settings) |
| SHEET_NAME | Empty (first sheet) |
| UNBLOCKED_URL_SCHEMES | Empty (all optional schemes blocked) |

In English, the preset headline is “One place to start your workday.” and the description is “Keep your work tools, service links, and daily to-dos in one place.” Existing values that exactly match either preset are treated as presets for display, without rewriting stored values.

Themes come from [DaisyUI](https://daisyui.com/docs/themes/). New users default to **Automatic**, which follows `prefers-color-scheme`: **Lofi** in light mode (or when unavailable) and **Dracula** in dark mode. They have the strongest text contrast among themes whose selected buttons also stand out from the page. Automatic needs no script: the page omits `data-theme`, and DaisyUI switches with the device setting while the page is open. Only the preference `auto` is stored. Explicit saved themes are preserved.

The 21 themes are Lofi, Light, Nord, Fantasy, Emerald, CMYK, Acid, Lemonade, Cyberpunk, Wireframe (Light), and Dracula, Dark, Dim, Night, Forest, Halloween, Synthwave, Black, Aqua, Luxury, Sunset (Dark). They were chosen because they keep 4.5:1 contrast for body text, muted text, buttons, neutral badges, warnings, and errors; the theme test checks this from DaisyUI's own color definitions. The portal uses `primary` only as a fill, never as text color, which many DaisyUI themes would not pass. Dark is kept as DaisyUI's standard dark theme although its button text is about 4.1:1. Unselected toggle buttons (view and tags) get a border mixed from 60% base-content, which keeps a 3:1 outline against the page in every theme. The list lives in `src/shared/themes.js` and the `@plugin "daisyui"` block of `styles.css`, which a test keeps in sync.

Theme names saved before v0.3.0 (Tsuyukusa, Sakura, and the other earlier palettes) are treated as Automatic without rewriting the stored value. Choose a theme again to replace it.

## Catalog loading and cache

The initial catalog is embedded as escaped JSON in the HTML response. The browser renders it directly without an initial `google.script.run` round trip. A live catalog read for a named sheet makes one Sheets API values request. When the sheet name is empty, it first fetches sheet titles and indices to resolve the first sheet, then reads values. Metadata is also fetched after a failed values request to retain useful missing-sheet diagnostics. Reordering tabs takes effect after cache expiry or **Fetch latest** when using the first-sheet fallback. Cache hits do not call Sheets.

**Catalog cache duration**, in **Settings → Tools & Links**, offers Disabled, 5 minutes, 1 hour, and 6 hours (default). Changes are saved automatically to the executing user's `CATALOG_CACHE_SECONDS` User Property and apply to the next load. Initialization preserves existing values. These settings do not belong in Script Properties or in the "gas-portal" configuration in package.json.

**Fetch latest** in Tools & Links bypasses the cache, reads the spreadsheet, and replaces the cached entry. Search, remaining selected tags, and the Cards/List choice are preserved. The retrieval time identifies the data snapshot; a Cached label indicates reuse. A normal browser reload may reuse the cache. Fetch latest also retries failed loads. Initial asynchronous loading and refresh use the spinning refresh icon without visible loading messages; failures and empty results remain explicit.

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

## GitHub Action Items

The first integration targets **GitHub.com**, including GitHub Enterprise Cloud organizations hosted on GitHub.com. Enterprise Server and Enterprise Cloud data-residency domains (`*.ghe.com`) are not supported yet. The portal only reads data: open the original issue or pull request to act. Unread notifications, marking notifications read, and issue/PR updates are outside this integration.

### Connect an account

1. Deploy the updated app with `npm run ship`. The manifest adds `script.external_request` so GAS can call GitHub. If Google requires additional consent, authorize as the deploying user; run `initializeProperties` in the GAS editor if necessary. Web-app visibility and execution identity remain unchanged.
2. Create a **fine-grained personal access token** in [GitHub Settings](https://github.com/settings/personal-access-tokens/new). Select the intended resource owner, the repositories you need, and an expiration date. Set repository permissions **Issues: Read-only** and **Pull requests: Read-only**; **Metadata: Read-only** is included automatically. Repository selection and API permissions are separate: selecting a repository does not grant access to all of its data. These two read permissions are the recommended configuration; successful searches with Metadata alone are not a reliable indication of complete access. Organization approval and policies may apply. Do not add write permissions. The portal's owner field only filters results, and the app cannot verify that a supplied token has no additional privileges.
3. In portal **Settings → Action Items → GitHub → Add connection**, enter the token and optionally an organization/account owner to filter searches. Connection names use `owner@login`, or `*@login` when the filter is blank (`*` means no owner filter). The portal validates the authenticated GitHub identity; the displayed `@login` comes from GitHub, not from a manually entered username. Classic PATs are deliberately rejected.
4. Leave the owner filter blank to include all repositories the token can access, including public repositories belonging to other owners. For example, use a company token with the company organization filter, and a personal token without a filter. Company public items may be fetched by both connections; the combined list deduplicates them. Repository-level filters and custom connection names are not supported. The owner filter does not change permissions: configure the token itself to restrict access.
5. Save and open **Action Items**. You can configure up to three independent connections for accounts or resource owners. Fine-grained tokens are limited to one resource owner, so create separate connections when needed. For private company repositories, choose the company organization as Resource owner; choosing your own account does not include them merely because you are a member. Public repositories remain readable regardless of the selected owner. The portal’s owner filter only narrows searches and cannot expand the token’s access. A token awaiting organization approval can read only public resources until approved. Blank token input while editing preserves the saved token; entering a replacement rotates it. The input is cleared after submission.

Tokens and connection settings are stored only in the executing user's `GITHUB_CONNECTION_<id>` User Properties. No token defaults are created by initialization. Tokens are never returned by the connection-list RPC, embedded in page HTML, cached with results, or logged. The browser necessarily sends a newly entered token to GAS once over its authenticated RPC. GAS User Properties are not a dedicated secret vault: anyone able to deploy code that runs as that user can access them. Keep personal deployments private and limit project/repository write access.

**Disconnect** removes the connection's stored token and cache. It does not revoke the token on GitHub; revoke unused tokens there yourself. Tokens expire and organization policies can revoke access. A new token is required if an existing one expires.

### Results, caching, and limits

- Four categories are searched separately: assigned open issues, directly requested PR reviews, team-requested PR reviews, and changes requested on your own open PRs (`is:open is:pr author:LOGIN review:changes_requested`). The same GitHub issue or PR is displayed once across all categories and connections, with its reason labels merged. Service identifiers keep items from different services distinct. Connection labels stay in Settings and error details.
- Changes requested means GitHub’s explicit **Request changes** review status. Ordinary comments asking for edits are not detected. A PR may remain in this state after you push a fix until its review status changes. The same optional owner filter applies; leave it blank to include your PRs in other owners’ accessible repositories.
- GitHub rows use update time in the unified list and show the service, repository, item number, update time, reason labels, and original link. Team results use GitHub's team-review qualifier; visibility depends on the authenticated account/token and organization policies. They are not inferred from display names or arbitrary mentions.
- Loading uses a rotating refresh icon (disabled animation with reduced-motion preferences), without a loading message. Existing results stay visible during refresh. Successful empty results use the same empty-state panel as Tools & Links; failures remain explicit errors.
- Action Items loads asynchronously only after its tab is opened. All connection RPCs start together, and the list updates once after every connection succeeds, fails, or reaches the 60-second batch timeout. The single refresh button bypasses every connection cache. Previous results, count, and retrieval time remain visible while refreshing. Opening Settings loads connection metadata but does not fetch issue/PR data. Initial connection loading uses an icon-only spinner in Settings and the shared refresh spinner in Action Items. No GitHub network requests occur in `doGet`.
- The authenticated GitHub login is verified and saved when a connection is created or edited. Live task reads use that saved login and call the four searches directly, without another `/user` request. Search responses detect revoked/expired credentials. Connection metadata comes from User Properties, with no GitHub request. Action Items stays asynchronous and is never embedded in the page HTML.
- GAS User Cache stores sanitized results using **Settings → Action Items → Action Items cache duration**: Disabled, 1 minute, 5 minutes (default), 15 minutes, 30 minutes, 1 hour, or 6 hours. This automatically saved `ACTIONS_CACHE_SECONDS` User Property applies to every Action Items service and connection, independently of the catalog setting. Shorter durations check the original retrieval time; longer durations cannot extend an existing Cache service expiry. Disabled bypasses reads and writes. Entries are keyed by connection and a revision replaced on credential/filter changes. The refresh icon forces a live read. Cached results may remain visible until expiry or refresh after access is revoked. The visible list is a snapshot and does not poll in the background. The toolbar timestamp is the oldest successful connection retrieval time, rather than the time the browser finished refreshing.
- Each category fetches at most two pages of 100 items (200 per category, at most eight search requests per live refresh), below GitHub Search's 1,000-result ceiling. Pagination is bounded to keep GAS execution time and API usage predictable. Displayed counts always mean **items shown**, not a global or guaranteed-complete task count. API `incomplete_results`, truncation, changing totals, duplicates across pages, invalid entries, and failed pages produce an explicit partial-result notice and a GitHub search link.
- After a batch settles, successful categories remain visible when another category or connection fails. A single expandable notice identifies the affected connections and categories. Failed connections do not retain their previous data after the batch completes; late responses from timed-out or removed connections are ignored. Expired/invalid credentials, forbidden access, rate limiting, invalid filters, transport failures, and partial results are shown distinctly from an empty successful result. Failed responses are not cached; a failed forced refresh does not silently reuse stale data. There are no automatic retries against rate limits.
- Search reflects the repositories visible to the token. GitHub can omit inaccessible repositories, especially with broad owner/global filters; a successful empty search is **not proof** of organization-wide access. Check token resource owner, repository selection, approval, and organization/SSO policies when expected items are missing; do not broaden permissions merely because a search is empty.

### Offline preview

Local preview starts with a fictional GitHub connection and task list. It never contacts GitHub. Use the literal `demo` in the token field to test adding a connection; never enter a real credential. Mock connections are kept in memory and reset on reload. No token is persisted to localStorage or fixtures.

Use `/?github=multiple#actions` for overlapping connections with one extra personal issue, `/?github=multiple-error#actions` for a failing second connection, `/?github=disconnected#actions`, `/?github=empty#actions`, `/?github=partial#actions`, `/?github=unauthorized#actions`, `/?github=rate-limit#actions`, or `/?github=error#actions` to inspect each state. Preview results are fixtures, not a live integration test.

References: [GitHub Search API](https://docs.github.com/en/rest/search/search#search-issues-and-pull-requests), [review search qualifiers](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests#search-by-pull-request-review-status-and-reviewer), [authenticated user](https://docs.github.com/en/rest/users/users#get-the-authenticated-user), and [fine-grained PAT setup and limitations](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).

## Action filters

The shared Action Items toolbar provides colored type chips, using the same subtle color tints and service-qualified names as row badges: **GitHub Assigned issue**, **GitHub Direct review**, **GitHub Team review**, **GitHub Changes requested**, and **Slack Bookmark**. Choose any number of chips to show items matching **at least one** selected type (OR). **All**, or deselecting every chip, shows the full loaded list. Tools tag filtering continues to use AND.

The search field matches loaded titles and Slack message excerpts, ignoring case, surrounding whitespace, and full-width character differences. Text search is combined with type selection using AND. **All** clears only the type selection; **Clear filters** in the empty state clears both. Search does not fetch additional messages or their full contents. Tools tags cycle through a shared accent palette in catalog tag order; their filter chips and card/list badges share colors. Filtering does not reassign colors, but catalog changes may.

Filtering is local and does not call APIs or change the server search limits. Both Tools and Actions use **visible / loaded items** counters, 24-hour **Retrieved HH:mm** labels, and the same refresh and filter-chip styling. Cache information appears in the timestamp tooltip; Actions additionally explains when the time represents the oldest connection result. Tags and action badges use a light tint of their accent color over the current theme, with readable theme text. Unselected filter chips have no visible border; selected chips use a stronger tint and inset outline. Transparent borders reserve the same space, and keyboard focus retains a separate outer outline. Action counts are deduplicated across connections. A PR with multiple matching types is still shown once. Filters survive tab changes, refreshes and language changes within the page; reloading resets them. A selected type remains available if its last matching item disappears, with a clearable empty state. Retrieval errors and additional-result notices remain visible regardless of filtering, so hidden rows do not conceal incomplete data.

## Slack bookmarks

Slack bookmarks appear in the shared **Action Items** list alongside GitHub, with a **Slack** service label and **Bookmark** badge. The portal uses the documented legacy [`search.messages`](https://docs.slack.dev/reference/methods/search.messages/) method with `is:saved`; it does not use browser sessions or the undocumented `saved.list` endpoint.

### Connect a workspace

1. Create an app in [Slack Apps](https://api.slack.com/apps) for the workspace you want to connect. Under **OAuth & Permissions → User Token Scopes**, add **`search:read`**, then install or reinstall the app. Workspace administrators may need to approve it.
2. Copy the **User OAuth Token** starting with `xoxp-`. Bot tokens, browser session tokens, and cookies are not supported. `search:read` permits searching messages the user can access, not only bookmarks; the portal always queries `is:saved` and never modifies Slack data. Automatic token rotation/refresh is not implemented; replace expired or revoked tokens in Settings.
3. Deploy the updated portal with `npm run ship`. No additional GAS scope is needed if GitHub already works: both use `script.external_request`.
4. Open **Settings → Action Items → Slack → Add connection**, paste the token, and save. `auth.test` verifies the workspace and user once at save time; the connection label is generated as `workspace@user`. Up to three distinct workspace/user connections are supported. Edit an existing connection to replace its token; leave the token blank to keep it. The password field is cleared immediately after submission.
5. Open **Action Items**. Its single refresh button fetches both GitHub and Slack connections together and bypasses all their caches.

Credentials live only in the executing user's `SLACK_CONNECTION_<id>` User Properties. They are excluded from HTML, metadata responses, result caches and logs. As with GitHub, User Properties are not a secret vault: code running as that user can read them. **Disconnect** deletes the local credential and cache, but does not uninstall the Slack app or revoke its token.

### Search coverage and caching

- These are **saved-message search results**, not a verified list of outstanding tasks. The dedicated Saved/Later view can contain entries that search does not return. User search preferences, message grouping, visibility and indexing can affect results. Saved files and manual To-dos are not included; message-backed To-do completion state is unavailable. A successful empty response means the search returned no messages.
- **Settings → Action Items → Slack → Bookmarks per connection** offers 10, 20 (default), 50, 100, or 200. This automatically saved `SLACK_BOOKMARK_LIMIT` User Property applies to every Slack connection, and the next visit to Action Items reads the new limit. Requests use the selected count (up to 100 per page), so the default fetches one page of 20; 200 needs at most two pages. Search totals and next-page metadata indicate additional results without a separate request. Reaching the limit shows an informational message beneath the list, separately from failures; it does not mean the search failed. Rejected records, inconsistent pages and failed requests still produce a partial-result warning. Counts describe displayed items, not a guaranteed Saved-view total. Rate limits produce an error without automatic retries.
- Titles are plain-text excerpts, up to 500 characters; Slack rich text, attachments and mentions are not fully rendered or resolved. Each row links to the original message and shows its workspace, channel and **posting time**, not when it was saved. The unified queue sorts GitHub updates and Slack posting times together.
- No Slack calls run during `doGet`. Connection metadata comes from User Properties; reads call search directly without repeating `auth.test`. All connections start asynchronously after provider metadata settles. A failed provider does not hide results from another.
- The shared **Action Items cache duration** applies (five minutes by default). Cache keys include the selected limit and a credential revision, so a smaller cached result never satisfies a larger request. Editing or disconnecting invalidates every limit variant for that connection. Cached excerpts are private to the executing user. Failed requests are not cached, and **Fetch latest** bypasses cached results. The list is a snapshot, with no background polling.

### Offline preview

Preview includes a fictional Slack connection and two saved messages. It never contacts Slack or retains a token. Use only `demo` in the token field; mock connections reset on reload. Query parameters support `slack=disconnected`, `empty`, `more` (55 search matches), `partial`, `unauthorized`, `rate-limit`, `scope`, and `error`, independently of `github=…`. For example, `/?github=empty&slack=partial#actions` shows Slack results with a partial failure. To inspect a fully empty or disconnected queue, set the same scenario for both services.

## Settings navigation

Settings has three subtabs: **Appearance** (portal text, theme, then language), **Tools & Links** (spreadsheet and catalog cache), and **Action Items** (shared cache duration, then GitHub and Slack connections). Switching tabs preserves unsaved form values; each control keeps its existing save behavior.

Direct links use `#settings/appearance`, `#settings/tools`, and `#settings/actions`. The existing `#settings` link opens Appearance. Browser back/forward works in both the GAS web app and local preview. Arrow keys and Home/End navigate within the focused tab row. **Manage connections** opens Action Items settings directly.
