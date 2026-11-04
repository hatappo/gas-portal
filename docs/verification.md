# Verification log

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

## Before publishing

- Configure the Git remote and verify package.json's repository / homepage / bugs fields. Distribute tarballs through GitHub Releases; do not publish to the npm registry.
- Run npm run check and npm run pack:local, then install the tarball in a separate directory.
- Use a test GAS project to verify login, push, console initialization, the first deployment, updates to an existing deployment ID, and live spreadsheet access.
