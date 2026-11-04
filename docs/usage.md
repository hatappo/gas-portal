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

The gear tab offers **Language** choices for Japanese and English. Selections are saved automatically in the executing user's `PORTAL_LANGUAGE` User Property. The initial preference is **Automatic (browser)** (`auto`). The first supported language in the browser preference list is used; English is the fallback when neither Japanese nor English is available. Browser preferences commonly reflect OS settings, but users can configure them separately. Existing explicit Japanese or English choices take priority. Select Automatic to resume detection. Detected languages are not persisted as explicit choices. Switching languages preserves filters, the selected tab, and unsaved display settings. Preset headlines and descriptions follow the language; custom text and spreadsheet data retain their original language. Theme names include their Japanese names in English mode.

The gear tab lets you edit the portal name, icon, headline, and description. These values are stored in User Properties. Restoring defaults only changes the form fields; explicitly save to apply them. Theme selections are saved automatically.

| Key | Default |
| --- | --- |
| PORTAL_NAME | My Portal |
| PORTAL_ICON | P |
| PORTAL_HEADLINE | One place to start your workday. |
| PORTAL_DESCRIPTION | Keep your work tools, service links, and daily to-dos in one place. |
| PORTAL_THEME | auto |
| PORTAL_LANGUAGE | auto (browser preference; English fallback) |

In English, the preset headline is “One place to start your workday.” and the description is “Keep your work tools, service links, and daily to-dos in one place.” Existing values that exactly match either preset are treated as presets for display, without rewriting stored values.

New users default to Automatic, which follows `prefers-color-scheme`: Tsuyukusa for light mode (or when unavailable), Tetsukon for dark mode. Changes are applied while the page is open. Only the preference `auto` is stored; resolved colors are not saved. Explicit saved colors are preserved.

The ten themes are Tsuyukusa, Sakura, Wakatake, Yamabuki, Ginnezu (Light), Tetsukon, Sumi, Kuri, Fukamidori, and Daidai (Dark). Ginnezu uses a monochrome silver palette and Daidai uses orange accents on a dark background. Their accent colors, Ginnezu `#afafb0` and Daidai `#ee7800`, are based on [Traditional Colors of Japan](https://www.colordic.org/w); companion shades are adjusted for readable contrast. Legacy Shikon values are treated as Kuri. Display settings previously stored in Script Properties migrate only into missing User Property keys. Spreadsheet connection settings remain in Script Properties.

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
