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

Creation makes a file named `<portal name> — Tools & Links`, with one `Tools` sheet and a native Google Sheets table named `PortalLinks`. It contains a header plus 100 empty entry rows and exactly eight columns in this order: `id`, `hidden`, `scope`, `tags`, `name`, `url`, `description`, `relatedLinks`. Columns beyond H do not exist. `scope` is a dropdown with `internal` and `external`; `hidden` is a checkbox; all other columns are text, including URLs and IDs with leading zeros. The header is frozen, column widths are set, and each header cell has a note describing its format. Notes follow the current portal language at creation, including a multiline `relatedLinks` example. Explicit English or Japanese takes priority; Automatic uses the browser language, with English as fallback. Changing the portal language later does not rewrite existing notes. The table header uses the portal’s Tsuyukusa blue (`#71a4d9`) with dark text. Add table rows in Sheets as needed.

The public [Table API](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/sheets#Table) does not expose the table-specific **Show condensed view** and **Show gridlines** switches. Enable those manually under the table menu → **Table formatting** after creation. The sheet-wide gridlines setting is separate and does not enable table gridlines.

The new ID is saved automatically to the executing account's `SPREADSHEET_ID` User Property. `SHEET_NAME` is never set or changed; leave it empty to use the new first sheet. If an old name is still configured, clear it and save before reloading. Open the created file using the link shown after creation. Existing spreadsheets are never initialized or overwritten by this action.

The ID is saved immediately after file creation, before table setup, to prevent a failed setup from creating another file on retry. A partial failure reports the stage and exposes the created file. If ID storage failed, the form retains the ID for manual saving; if table setup failed, inspect the created file before using it. If creation cannot be confirmed, check Drive and reload before retrying; the request may still have completed. The UI does not automatically retry or delete files. If it still fails after authorization, inspect the GAS execution log: `SPREADSHEET_CREATION_FAILED` records the exact stage and original exception text. API details are confined to execution logs and never returned to the browser; do not publish logs without reviewing them for private file information.

### Columns

Columns are matched by their case-sensitive names in the first row, so you can rearrange them freely.

| Column | Content |
| --- | --- |
| id | Required. A unique string ID, sorted in ascending order |
| hidden | TRUE hides the row; FALSE or blank keeps it visible. Standard checkboxes are supported |
| scope | internal / external, or the supported Japanese aliases 社内 / 社外. Defaults to internal |
| tags | Multiple tags separated by commas, Japanese commas, or line breaks |
| name | Required. Display name |
| url | Required. Primary HTTPS link |
| description | Plain text; HTML and Markdown are not interpreted |
| relatedLinks | One entry per line within a cell: HTTPS URL, a space, then a label |

The optional `hidden` column is matched by its header, regardless of position. Only `TRUE` (ignoring case and surrounding whitespace) hides a row; other values remain visible. Hidden rows stay in the spreadsheet but are excluded before validation and duplicate-ID checks, and never enter the catalog response, embedded HTML data, or cache. They do not contribute tags, search results, or counts. After changing a checkbox, use **Fetch latest** to bypass an existing cache, or wait for cache expiry.

Optional columns can be omitted. Enter URLs as text rather than named smart chips. Unknown columns are not included in the public response. Invalid entries are reported with their row numbers. Primary URLs with the Apps Script origin automatically receive a GAS tag.

### Permissions

Catalog reads use `spreadsheets.readonly`, which is not restricted to the configured file. Creation and table setup use `drive.file`, which allows writing files created by or explicitly opened with this app; the app does not request the broad `spreadsheets` write scope. Entering an existing spreadsheet ID does not grant per-file write access. The creation permission remains authorized after setup, while ordinary catalog loading only reads data. See the [Sheets authorization scopes](https://developers.google.com/workspace/sheets/api/scopes).

When upgrading to this feature, push and deploy the new code and authorize the added scope as the deploying account. CLI deployment alone does not confirm that the new consent has been granted. Creation checks authorization before calling Sheets and shows editor instructions when consent is missing. If authorization is required, push the latest code, reload the GAS editor, and run `initializeProperties` with that account. This editor entry point calls `ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL)` before acquiring a lock or changing properties. Missing consent stops execution and opens the authorization flow. After granting consent, run it again if necessary. `PORTAL_AUTHORIZATION_CHECK_STARTED` and `PORTAL_AUTHORIZATION_GRANTED` identify the check and successful authorization in the execution log. Normal automatic property initialization does not invoke this consent flow. Creation blocked by the check logs `SPREADSHEET_CREATION_BLOCKED AUTHORIZATION_REQUIRED`. If the editor reports granted consent but the web app still reports missing consent, verify the executing account and deployment version before retrying. Keep this a personal project and control who can edit its code.

## Tab URLs

Append `#tools`, `#actions`, or `#settings` to the published web app URL to open Tools & Links, Action Items, or Settings directly. Clicking a tab or navigating the tab bar with the keyboard updates the hash without reloading the page. Browser Back and Forward restore the selected tab, preserving unsaved form text and current tool filters. Reopening or reloading a URL restores the tab, not unsaved form data. An absent or unknown hash opens Tools & Links.

GAS uses `google.script.url` and `google.script.history` to read and update the outer web app URL, rather than the sandbox iframe URL. Local previews use the browser history API. Query parameters are preserved; tab changes do not fetch the catalog again. Only the tab name is stored in the URL.

## Display settings

The lower part of **Display settings** in the gear tab offers **Language** choices for Japanese and English. Selections are saved automatically in the executing user's `PORTAL_LANGUAGE` User Property. The initial preference is **Automatic (browser)** (`auto`). The first supported language in the browser preference list is used; English is the fallback when neither Japanese nor English is available. Browser preferences commonly reflect OS settings, but users can configure them separately. Existing explicit Japanese or English choices take priority. Select Automatic to resume detection. Detected languages are not persisted as explicit choices. Switching languages preserves filters, the selected tab, and unsaved display settings. Preset headlines and descriptions follow the language; custom text and spreadsheet data retain their original language. Theme names include their Japanese names in English mode.

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
| SPREADSHEET_ID | Empty (configure in Settings) |
| SHEET_NAME | Empty (first sheet) |

In English, the preset headline is “One place to start your workday.” and the description is “Keep your work tools, service links, and daily to-dos in one place.” Existing values that exactly match either preset are treated as presets for display, without rewriting stored values.

New users default to Automatic, which follows `prefers-color-scheme`: Tsuyukusa for light mode (or when unavailable), Tetsukon for dark mode. Changes are applied while the page is open. Only the preference `auto` is stored; resolved colors are not saved. Explicit saved colors are preserved.

The ten themes are Tsuyukusa, Sakura, Wakatake, Yamabuki, Ginnezu (Light), Tetsukon, Sumi, Kuri, Fukamidori, and Daidai (Dark). Ginnezu uses a monochrome silver palette and Daidai uses orange accents on a dark background. Their accent colors, Ginnezu `#afafb0` and Daidai `#ee7800`, are based on [Traditional Colors of Japan](https://www.colordic.org/w); companion shades are adjusted for readable contrast. Legacy Shikon values are treated as Kuri.

## Catalog loading and cache

The initial catalog is embedded as escaped JSON in the HTML response. The browser renders it directly without an initial `google.script.run` round trip. A live catalog read for a named sheet makes one Sheets API values request. When the sheet name is empty, it first fetches sheet titles and indices to resolve the first sheet, then reads values. Metadata is also fetched after a failed values request to retain useful missing-sheet diagnostics. Reordering tabs takes effect after cache expiry or **Fetch latest** when using the first-sheet fallback. Cache hits do not call Sheets.

**Catalog cache duration**, below the display text fields and above Language in **Display settings**, offers Disabled, 5 minutes, 1 hour, and 6 hours (default). Changes are saved automatically to the executing user's `CATALOG_CACHE_SECONDS` User Property and apply to the next load. Initialization preserves existing values. These settings do not belong in Script Properties or portal.config.json.

**Fetch latest** in Tools & Links bypasses the cache, reads the spreadsheet, and replaces the cached entry. Search, scope, remaining selected tags, and the Cards/List choice are preserved. The retrieval time identifies the data snapshot; a Cached label indicates reuse. A normal browser reload may reuse the cache. Fetch latest also retries failed loads.

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

Spreadsheet settings are simulated too: saving an ID or URL still displays mock data and never fetches that spreadsheet. **Create new spreadsheet** saves a fake ID in preview storage and displays an empty catalog after reload; it never creates a Google file. The saved fake ID also blocks repeated creation until disconnected. Preview settings stay in that browser's localStorage and do not affect production or consumer projects in other directories.

## Troubleshooting

- `invalid_grant` / `invalid_rapt`: run `npm run login` from the consumer directory and select the correct Google account to reauthenticate.
- No versioned deployments: create the first web app deployment in the GAS console.
- Multiple versioned deployments: inspect `npx portal deployments` and select the target with `npx portal deploy --deployment-id ID`.
- Configured deploymentId not found: check whether it belongs to another project or has been deleted. The CLI does not switch to a different ID automatically.
- Direct clasp access: run `npx clasp --project .portal/.clasp.json --user PROFILE COMMAND`, explicitly selecting both the project and authentication profile.
