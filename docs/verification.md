# Verification log

Historical record of manual verification for the 0.1.x releases. It is not updated for later versions; current behavior is covered by `npm run check` and described in README.md and docs/usage.md.

## 0.1.0 / 2026-11-04

- npm ci, lint, browser/GAS type checks, asset generation, and 98 tests passed with Node.js 26.12.1 and npm 12.2.1.
- Preserved catalog rendering, sheet parsing, tags, related links, themes, display settings, legacy settings migration, and timeout behavior.
- Verified repeated init calls, preservation of existing package.json/configuration/gitignore, invalid input handling, and protection of symbolic links and unrelated `.portal` directories.
- Isolated Script IDs, authentication profiles, generated files, and preview storage by environment.
- Used clasp's actual show-file-status behavior to verify that only the seven allowed files are uploaded. Extra JS/HTML/JSON files and nested files with matching names were excluded.
- Verified that deploy does not build or push, and rejects zero or ambiguous deployments, invalid IDs, HEAD, and IDs from other projects. Checked explicit/configured IDs, description arguments, and configuration preservation after failures.
- Checked npm pack contents: only the CLI, compiled assets, usage documentation, and licenses; no source, tests, environment configuration, or credentials.
- Installed the tarball in a separate directory and ran init / build / preview without source or development dependencies. Checked search, external filtering, List view, and persistence of the display name and theme in the browser.
- A fresh installation without a lockfile succeeded against the official registry. Offline resolution initially failed npm's min-release-age check because cached metadata was incomplete; an online installation resolved it without changing security settings.
- All seven generated GAS files were byte-for-byte identical before and after the consumer migration.
- Consumer npm ci and build passed. Preview bound only to localhost. Direct HTTP requests for environment configuration returned 404; Vite /@fs/ requests returned 403.
- Google authentication, production push/deploy, and live spreadsheet access were not tested. Nothing was published to npm.

## Release distribution and preview layout / 2026-11-04

- Lint, type checks, build, and 99 tests passed. Init generates the current CLI version's GitHub Release URL and preserves existing Release URLs and file dependencies in either dependency section.
- Locally checked the release workflow's YAML, matching/mismatching tag versions, and gh arguments for stable releases and prereleases. The workflow has not been run on GitHub Actions or used to publish a release.
- Installed the latest tarball in a temporary directory and ran init / build without source files. Confirmed that the production HTML contains no preview label.
- Migrated the consumer to a directory dependency; npm ci and build passed. Application changes require a package build followed by a consumer preview restart.
- Checked desktop and 390px browser layouts: LOCAL PREVIEW sits at the end of the header without taking a separate row above the headline.
- No Google authentication, push, or deploy operations were performed.

## English repository conventions and bilingual UI / 2026-11-04

- Converted documentation, CLI/build messages, comments, and test descriptions to English. Conventional Commit messages will use English; existing history was not rewritten.
- Added Japanese/English UI selection backed by PORTAL_LANGUAGE in User Properties and isolated localStorage in previews. Japanese remains the default. Initialization preserves existing values.
- Shared translations cover static labels, accessible names, loading/error/save messages, validation warnings, and preset display text. Custom text and sheet data retain their original language.
- Lint, type checks, build, and 107 tests passed, including language persistence, migration, input preservation, invalid values, failures, timeouts, and localized server messages.
- Verified language switching and restoration in the browser, and checked the English UI at desktop and 390px widths.
- The seven-file GAS output contract and OAuth scopes are unchanged. No live GAS push/deploy was performed.

## Automatic language selection and additional themes / 2026-11-04

- Changed the language fallback to English. Missing preferences now follow the first supported language in the browser's ordered preferences; explicit saved Japanese/English choices remain authoritative.
- Added an Automatic option and browser language-change handling without persisting the detected language as an explicit choice. Initialization creates PORTAL_LANGUAGE=auto only when missing.
- Added Ginnezu (light monochrome, #afafb0) and Daidai (dark orange, #ee7800), based on colordic.org's traditional Japanese colors. There are now five light and five dark themes.
- Lint, browser/GAS type checks, asset generation, and all 110 tests passed. Tests cover language resolution, automatic/manual preference changes, localized defaults, all ten theme values, and text contrast.
- Consumer build passed. Browser verification confirmed automatic Japanese selection, both new palettes, and restoration after reload.
- The seven-file GAS output contract and OAuth scopes remain unchanged. No live GAS push/deploy was performed.

## Automatic color scheme / 2026-11-04

- Added an Automatic theme preference, resolving the browser's preferred color scheme to Tsuyukusa (light) or Tetsukon (dark), with light as the unsupported-browser fallback.
- Preserved explicit saved themes and made auto the missing-property initialization default. Media-query changes update the current palette without RPC writes; failed saves restore the previous preference.
- Added CSS for the automatic dark palette before JavaScript runs. The setting remains a separate compact row above the existing ten theme cards.
- Lint, type checks, build, and 112 tests passed, including both system modes, live changes, explicit overrides, failed saves, and unsupported media queries. Consumer build passed.
- Initial catalog loading was inspected, not benchmarked or changed: HTML delivery is followed by getCatalog RPC, sheet-name validation, and sheet-value retrieval. Follow-up candidates include reducing service calls, short-lived server caching, and embedding the initial catalog in HTML; each requires separate validation of freshness and error behavior.
- No production push/deploy was performed.

## Catalog caching and settings order / 2026-11-04

- Moved language selection to the end of Settings, after the new cache duration control.
- Reduced a successful live read from two Sheets requests to one; metadata is requested only to diagnose a failed values read. A valid cache hit makes zero Sheets requests.
- Added executing-user cache entries scoped to spreadsheet ID and sheet name, with a one-hour default and Disabled / 5 minutes / 1 hour / 6 hours choices. Forced refresh bypasses and replaces the entry while preserving filters and view mode.
- Tested expiration, cache eviction/corruption/outages, oversized UTF-8 catalogs, invalid configuration, excluded private sheet columns, failed refreshes, and serialized cache fills. Preview storage remains isolated by consumer directory.
- Lint, browser/GAS type checks, build, and all 123 tests passed. Consumer build passed. Browser verification covered cached reloads, forced refresh, cache-duration persistence, language placement, and the 390px layout.
- The seven-file output and OAuth scopes are unchanged. No live GAS deployment or real Sheets latency benchmark was performed; improvements are verified by API-call counts rather than claimed timing gains.

## Display settings grouping / 2026-11-04

- Grouped cache duration and language below the display text form, within the Display settings section. The divider now follows these controls and separates the Color theme section.
- Kept automatic preference saving independent of the display form submit/reset actions. Updated the grouping regression assertion.
- Initial catalog loading still uses the asynchronous GAS RPC; cache hits avoid Sheets access but do not remove the loading state or browser-to-GAS round trip.

## Optional intro text / 2026-11-04

- Allow explicitly blank headline and description values while retaining defaults for absent properties. Initialization and language changes preserve saved blanks.
- Hide each blank intro element and remove the entire intro area from layout when both are empty, including initial server HTML. Saving defaults restores the area; resetting form fields alone does not.
- Lint, type checks, build, and 125 tests passed; consumer build passed. Browser verification confirmed empty-value saving, restoration after reload, and the compact list layout.
- Initial catalog data is still fetched asynchronously. HTML embedding was discussed but not implemented in this change.

## Embedded initial catalog / 2026-11-04

- Embed the initial catalog in a non-executable JSON script element during doGet. Valid initial data renders without a client catalog RPC or an intermediate loading panel; manual refresh still uses the asynchronous forced-refresh path.
- Escape HTML-sensitive characters and Unicode line separators before embedding spreadsheet content. Tests cover malicious script-closing text, exact JSON round trips, malformed payloads, safe error rendering, and manual recovery.
- Verified one Sheets values request for a cold doGet and no additional Sheets requests for a warm cached doGet. Missing bootstrap markup retains the legacy asynchronous fallback.
- Added a 24px gap between the header and navigation when both intro fields are blank. Browser verification confirmed saved blanks after reload, immediate catalog rendering, and successful forced refresh.
- Lint, browser/GAS type checks, build, and all 131 tests passed; consumer checks/build and git diff --check passed. The seven-file GAS output contract and OAuth scopes remain unchanged.
- No production push/deploy or live GAS latency benchmark was performed. Cache misses now delay HTML delivery while the initial sheet read completes.

## Compact catalog controls / 2026-11-04

- Made the refresh button icon-only while retaining its localized accessible name, hover explanation, and 44px target. Grouped the retrieval timestamp beside the button without a separate timestamp row.
- Placed the Tags label beside the wrapping tag controls. Narrow layouts wrap control groups while keeping retrieval details and refresh together.
- Lint, browser/GAS type checks, build, and all 131 tests passed, including refresh behavior and Japanese/English accessibility labels. Consumer build passed.
- Browser verification confirmed the desktop layout, successful icon-triggered refresh, and wrapping at 390px and 320px widths. No production push/deploy was performed.

## Lucide controls and six-hour cache default / 2026-11-04

- Bundled Lucide refresh-cw, layout-grid, and list SVGs with their license notices; development and packaged builds embed them without CDN requests.
- Made Cards/List icon-only with accessible names and matching hover titles. Refresh is transparent and muted at rest, with a button surface on hover or keyboard focus; all targets remain 44px.
- Display retrieval times as 24-hour HH:mm without dates or day periods in Japanese and English, including 00:05 at midnight.
- Set the cache fallback and initializer to 21600 seconds across GAS, browser controls, and previews. Existing saved values remain authoritative. Tested the six-hour expiration boundary and preservation of explicit settings.
- Lint, type checks, build, and all 132 tests passed; consumer build and git diff --check passed. Browser verification covered Cards/List switching, keyboard focus, forced refresh, and desktop/390px layouts.
- No production push/deploy was performed.

## Combined refresh control / 2026-11-04

- Combined the refresh icon and retrieval time into one button with a 6px gap. The entire control is clickable, transparent at rest, and receives a subtle background on hover or keyboard focus.
- Retained the localized action label, tooltip, timestamp live region, and a minimum 44px target height. Added the timestamp as the accessible description.
- Added a regression test for timestamp clicks, forced refresh, duplicate-click prevention while loading, and successful timestamp restoration.
- Lint, type checks, build, and all 133 tests passed; consumer build passed. Browser verification confirmed timestamp-triggered refresh, the combined hover background, and the updated time. No production push/deploy was performed.

## Before publishing

- Configure the Git remote and verify package.json's repository / homepage / bugs fields. Distribute tarballs through GitHub Releases; do not publish to the npm registry.
- Run npm run check and npm run pack:local, then install the tarball in a separate directory.
- Use a test GAS project to verify login, push, console initialization, the first deployment, updates to an existing deployment ID, and live spreadsheet access.
