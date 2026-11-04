# Usage guide

## Initial setup

1. Using the Google account for this work environment, create a standalone Apps Script project and a spreadsheet that you control.
2. Install gas-portal in a consumer directory and run `portal init --script-id ID --auth-profile work-a`.
3. Enable the Apps Script API in the account's Apps Script settings. Run `npm run login` and select the correct account. Verify it with `npx portal status`.
4. Upload the code with `npm run push`.
5. Open the GAS editor with the same account. Select `initializeProperties` from the function selector and run it. Review the authorization prompt if one appears.
6. Under **Project Settings → Script Properties**, set `SPREADSHEET_ID` and `SHEET_NAME` to the actual values.
7. Create the first deployment with **Deploy → New deployment → Web app**. Set execution to yourself and access to only yourself.
8. Open the published URL and check the live data. For subsequent updates, run `npm run push` and `npm run deploy`. A successful deploy saves the selected deploymentId if none was configured.

Use separate GAS projects and spreadsheets for each environment, with access restricted to their owner. Run initialization as the deploying account because User Properties belong to the executing user. Initialization adds only missing keys and preserves existing values, including empty strings. The legacy `initializeScriptProperties` function remains available for compatibility.

To update application code, upgrade the package, check build / preview, then push / deploy. Changes to spreadsheet data or display settings do not require redeployment.

## Spreadsheet

Columns are matched by their case-sensitive names in the first row, so you can rearrange them freely.

| Column | Content |
| --- | --- |
| id | Required. A unique string ID, sorted in ascending order |
| name | Required. Display name |
| url | Required. Primary HTTPS link |
| description | Plain text; HTML and Markdown are not interpreted |
| scope | internal / external, or the supported Japanese aliases 社内 / 社外. Defaults to internal |
| tags | Multiple tags separated by commas, Japanese commas, or line breaks |
| relatedLinks | One entry per line within a cell: HTTPS URL, a space, then a label |

Optional columns can be omitted. Enter URLs as text rather than named smart chips. Unknown columns are not included in the public response. Invalid entries are reported with their row numbers. Primary URLs with the Apps Script origin automatically receive a GAS tag.

Spreadsheet access is read-only, but the OAuth permission is not restricted to the single configured file. Keep this a personal project and control who can edit its code.

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

In English, the preset headline is “One place to start your workday.” and the description is “Keep your work tools, service links, and daily to-dos in one place.” Existing values that exactly match either preset are treated as presets for display, without rewriting stored values.

New users default to Automatic, which follows `prefers-color-scheme`: Tsuyukusa for light mode (or when unavailable), Tetsukon for dark mode. Changes are applied while the page is open. Only the preference `auto` is stored; resolved colors are not saved. Explicit saved colors are preserved.

The ten themes are Tsuyukusa, Sakura, Wakatake, Yamabuki, Ginnezu (Light), Tetsukon, Sumi, Kuri, Fukamidori, and Daidai (Dark). Ginnezu uses a monochrome silver palette and Daidai uses orange accents on a dark background. Their accent colors, Ginnezu `#afafb0` and Daidai `#ee7800`, are based on [Traditional Colors of Japan](https://www.colordic.org/w); companion shades are adjusted for readable contrast. Legacy Shikon values are treated as Kuri. Display settings previously stored in Script Properties migrate only into missing User Property keys. Spreadsheet connection settings remain in Script Properties.

## Catalog loading and cache

The initial catalog is embedded as escaped JSON in the HTML response. The browser renders it directly without an initial `google.script.run` round trip. A live catalog read makes one Sheets API values request. Sheet metadata is fetched only after a failed values request to retain useful missing-sheet diagnostics. Cache hits do not call Sheets.

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

Preview settings stay in that browser's localStorage and do not affect production or consumer projects in other directories.

## Troubleshooting

- `invalid_grant` / `invalid_rapt`: run `npm run login` from the consumer directory and select the correct Google account to reauthenticate.
- No versioned deployments: create the first web app deployment in the GAS console.
- Multiple versioned deployments: inspect `npx portal deployments` and select the target with `npx portal deploy --deployment-id ID`.
- Configured deploymentId not found: check whether it belongs to another project or has been deleted. The CLI does not switch to a different ID automatically.
- Direct clasp access: run `npx clasp --project .portal/.clasp.json --user PROFILE COMMAND`, explicitly selecting both the project and authentication profile.
