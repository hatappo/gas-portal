# gas-portal

A personal work portal built with Google Apps Script, with a CLI for building, previewing, and deploying separate work environments.

Display links from a spreadsheet as cards or a list. Connect an existing spreadsheet or create a new one with a typed table and column notes from Settings. Links may use app schemes such as `vscode://`; script schemes are always blocked, and other risky schemes are blocked until you allow them in Settings (see [URL schemes](docs/usage.md#url-schemes)). Search by name, description, or tags; filter by tags; add related links as rows with a blank id below their tool; and customize the appearance with 21 [DaisyUI](https://daisyui.com/) themes and editable display text. The settings tab lets you switch between Japanese and English; your language preference is saved in User Properties. The initial selection follows browser preferences, with English as the fallback. Action Items shows assigned GitHub issues, direct/team review requests, and changes requested on your own open PRs through user-managed fine-grained tokens. Configure up to three connections in Settings. Action Items combines their results into one deduplicated list with service labels and a single refresh button. Connections load in parallel, independently of the tool catalog, and share a configurable cache duration (five minutes by default). See [GitHub setup](docs/usage.md#github-action-items) for permissions, filters, and limitations.

**Consumer projects only need configuration and a package dependency.** The CLI generates GAS code under `.portal/`. Each work environment can use its own Google account, Apps Script project, and spreadsheet.

## Installation

Packages are distributed as `gas-portal-VERSION.tgz` assets on GitHub Releases, without publishing to the npm registry. Use the attached package from a published release in the public repository. GitHub's automatic Source code archives do not include the compiled assets.

Requirements: Node.js 26.x and npm 11.20 or later (the version bundled with Node.js 26). To access GAS, enable the Apps Script API for the target Google account and sign in with clasp.

```sh
# In a new directory for your work environment
npm init -y
# Use the .tgz URL from the release's Assets section
npm install --save-dev --save-exact https://github.com/hatappo/gas-portal/releases/download/vVERSION/gas-portal-VERSION.tgz
npx portal init --script-id YOUR_SCRIPT_ID --auth-profile work-a
npm run login
npm run build
npm run preview
```

Replace `VERSION` with a [published release](https://github.com/hatappo/gas-portal/releases). Commit the dependency URL in package.json and the generated package-lock.json, then use `npm ci` for subsequent installations. To upgrade, run npm install with the new release's URL. Use a versioned URL rather than a mutable `latest` URL.

To test a local package, run `npm ci`, `npm run check`, and `npm run pack:local` in this repository, then install `releases/gas-portal-VERSION.tgz`. The packaging command refuses to overwrite an existing package with different contents at the same version.

When `portal init` adds a dependency, it uses the GitHub Release URL for the running CLI's version. Existing configuration, dependency specifications, and npm scripts with matching names are preserved. The command also adds generated files and credentials to `.gitignore`. You can initialize before creating a GAS project and fill in the configuration in package.json later. Initialize the consumer's Git repository yourself if needed.

```text
my-work-portal/
├── package.json          # Includes the "gas-portal" configuration
├── package-lock.json
├── .gitignore
└── .portal/               # Not tracked by Git
    ├── generated.json
    ├── .clasp.json         # Generated
    ├── .claspignore        # Allows only the seven GAS files
    ├── dist/
    └── preview/
```

## Environment configuration

The configuration lives under the `"gas-portal"` key in the consumer's package.json. `portal deploy` rewrites only this key and keeps the other fields and the indentation.

```json
{
  "name": "my-work-portal",
  "private": true,
  "gas-portal": {
    "scriptId": "YOUR_SCRIPT_ID",
    "authProfile": "work-a",
    "deploymentId": "YOUR_WEB_APP_DEPLOYMENT_ID"
  }
}
```

- `scriptId`: the Apps Script project to upload to. This is not a Google Cloud project ID.
- `authProfile`: a named clasp authentication profile, not an email address. Select the appropriate Google account when running `portal login`.
- `deploymentId`: an existing deployment to update. Omit it before the first deployment. If exactly one versioned deployment exists, the CLI selects it and saves its ID after a successful update. Specify the ID when multiple deployments exist.
- `repositoryUrl`: an optional GitHub repository URL for the footer. When omitted, the CLI uses the consumer directory's Git origin. Set it to an empty string to hide the link. URLs with credentials or hosts other than GitHub are rejected.

Authentication tokens remain in clasp's standard credential store. Every remote CLI operation explicitly selects `--user`; it does not silently switch to the default account. Use `portal status` to check the account associated with a profile. Changing the profile does not change the web app's execution identity.

## Commands

| Command | Behavior |
| --- | --- |
| `portal init` | Prepare environment configuration, npm scripts, and gitignore entries |
| `portal login` | Sign in to Google using the selected profile |
| `portal status` | Show the target project and authentication status |
| `portal build` | Generate seven GAS files from bundled assets, without network access |
| `portal preview [--port 4174]` | Serve mock data with Vite, without contacting GAS or Sheets |
| `portal browse [--deployment-id ID]` | Open the published web app in the default browser without pushing or deploying |
| `portal push` | Build and upload the code to GAS; does not update the published version |
| `portal deployments` | List deployments for the target GAS project |
| `portal deploy [-d TEXT] [--deployment-id ID]` | Create a version from code already saved in GAS and update an existing deployment |

`portal init` generates `npm run browse` to open the deployed web app. It uses the configured `deploymentId`, or discovers the only versioned deployment using `scriptId`. Multiple deployments require `--deployment-id ID`; the target must have a web app entry point. This uses the selected clasp authentication profile to look up the URL; the browser uses its own signed-in Google session. Rerun `portal init` to add the script to an existing consumer.

`portal init` also generates `npm run ship`, an alias for `npm run push && npm run deploy`. It uploads first and updates the deployment only after a successful push. Run `portal init` again to add this alias to an existing consumer; existing scripts are preserved.

**deploy does not run build, push, or check.** Create the first web app deployment manually in the GAS console. The CLI stops with instructions if no versioned deployment exists. It also refuses to update HEAD or a deployment ID outside the target project. If multiple versioned deployments exist, including API executable deployments, specify the web app's ID.

Missing property defaults are initialized automatically; manually running an initializer is optional. To initialize them explicitly or authorize newly added permissions, run `initializeProperties` in the GAS editor as the deploying account. It calls `ScriptApp.requireAllScopes` before adding missing properties, preserving existing values. No Execution API deployment or custom OAuth client is required.

See the [usage guide](docs/usage.md) for initial setup, spreadsheet columns, display settings, and preview scenarios.

## Development

```sh
npm ci
npm run dev               # Vite: Solid/CSS HMR, JS/HTML reloads
npm run check             # Lint, type checks, build, and tests
npm run pack:local
```

The frontend uses [Solid](https://www.solidjs.com/) 1.x with [Kobalte](https://kobalte.dev/) tabs, tooltips, segmented controls, radio groups, toggle groups, and collapsible disclosures. `src/browser/*-view.tsx` owns the dynamic Tools and Action Items lists; `tabs.tsx` adopts the server-rendered panels so tab navigation preserves form drafts. The adjacent JavaScript controllers coordinate GAS RPCs, validation, timeouts, and routing. The theme picker uses a controlled Radio Group and retains the shared save helper for rollback and timeouts. Other settings forms still use their existing DOM controllers and shared save helper; they can be migrated independently. Disclosures share a 240ms height transition, keep their content mounted for controller updates, and respect reduced-motion preferences. Do not mutate Solid-owned list contents from those controllers. Shared translations, theme definitions, and catalog rules remain usable by both the browser and GAS.

Solid and Kobalte are build-time dependencies, bundled into `Client.html`; deployed portals do not fetch them from a CDN. Source development, linked consumer previews, and production builds use the same Solid Vite plugin. Browser tests compile the components with this plugin before running their interactions in jsdom.

Application source lives in `src/`; the CLI lives in `bin/` and `lib/`. Styles use [Tailwind CSS](https://tailwindcss.com/) v4 and [DaisyUI](https://daisyui.com/) v5, compiled into the inline GAS stylesheet at build time. Prefer DaisyUI components (`btn`, `input`, `card`, `badge`, …) and DaisyUI color variables over custom colors. The `include` list in `src/browser/styles.css` names the DaisyUI parts in use; add a component there before using it. Use `primary` only as a fill, not as text color, so every theme keeps readable contrast. `npm run build` generates GAS output in `dist/` and package assets in `assets/`. Published packages contain the CLI, compiled assets, and usage documentation. They exclude source files, tests, environment configuration, and credentials.

`npm run screenshots` captures the local preview in every theme at 1280px and 390px for visual review, and writes per-theme images plus one contact sheet per view and width to the untracked `screenshots/` directory. It takes about 20 seconds. Narrow it with `--themes nord,night`, `--views tools,appearance`, or `--widths 390`; views are `tools`, `list`, `actions`, `appearance`, `settings-tools`, and `settings-actions`. It uses Playwright and is not part of `npm run check` or CI. Install the browser once with `npx playwright install chromium` (about 100MB). Page errors make the command fail.

To preview the GAS footer link during development, set `scriptId` in an untracked `.clasp.json`. The optional `SPREADSHEET_ID` environment variable accepts an ID or Google Sheets URL to preview the spreadsheet setting and footer link. Neither value is embedded in packaged assets.

`npm run dev` provides HMR for application development. With a local checkout dependency, the consumer's `portal preview` also serves source directly through Vite: HTML, CSS, and browser code changes appear without rebuilding or restarting. Release packages use bundled output and reread it on reload. Consumer configuration changes trigger a reload. Restart after changing CLI or preview-server scripts. Preview settings are stored in browser localStorage and isolated by consumer directory. Demo entries remain visible after testing spreadsheet creation; use `?state=empty` to preview an empty list.

The GAS build uses Terser to keep URLs and multiline text in quoted string literals, avoiding HtmlService parsing issues with minifier-generated template literals.

Tests mock Google services and do not change live GAS projects or spreadsheets. Before releasing, use a separate test project to verify authentication, push, deployment, and spreadsheet access.

## Testing local changes in a consumer project

Use a directory dependency to test changes without publishing a release:

```sh
# In this repository: install dependencies and build assets
npm ci
npm run build

# In the consumer project: adjust the relative path to your layout
npm install --save-dev --install-links=false ../../hobby/gas-portal
npm run preview
```

Add `install-links=false` to the consumer's `.npmrc` to keep the dependency as a symbolic link. Running npm ci in the consumer does not install dependencies in the linked repository. The consumer preview detects the linked source checkout and uses Vite HMR. Rebuild in this repository before `build`, `push`, or `ship` to update the packaged GAS output. Restart the preview after CLI or preview-server script changes. A directory dependency does not pin source contents in the lockfile; use release tarballs for regular work environments.

## Workflow dependencies

GitHub Actions dependencies are locked in `.github/workflows/actions.lock` ([workflow lockfiles](https://github.blog/changelog/2026-10-28-github-actions-workflow-lockfiles-are-generally-available/)). Workflows reference exact release tags, and runs use the commits recorded in the lockfile, including actions that other actions call. After adding a workflow or changing any `uses:`, run `gh actions-lock` (install once with `gh extension install github/gh-actions-lock`) and commit the workflow and lockfile together; review the lockfile diff. The **Verify actions lockfile** workflow runs `gh actions-lock --verify` on pushes to `main` and on pull requests.

## Releases

The workflow in `.github/workflows/release.yml` runs when a `v*` tag is pushed. It checks that the tag matches package.json, runs lint, type checks, the build, and tests, then attaches the `.tgz` to a GitHub Release. No npm registry token is required. Only the publishing job grants write access to the standard GITHUB_TOKEN. Tags containing a suffix such as `-rc.1` produce prereleases.

```sh
# Bump the version without overwriting existing tags or packages
npm version patch --no-git-tag-version
npm run check
git add package.json package-lock.json
git commit -m "chore(release): bump package version"
# Replace VERSION with the version in package.json
git tag vVERSION
git push origin HEAD
git push origin vVERSION
```

Commit the release's source and workflow changes before tagging. Existing releases are not overwritten. Publish a new version whenever package contents change. The local `v0.1.0` tag predates this distribution workflow, so use a new version for the first release through it.

## Tool favicons

Tool cards, list rows, and related links (at 14 × 14) show decorative favicons. A row's optional `icon` column overrides detection with an emoji or an image URL (see [Icons](docs/usage.md#icons)). Otherwise, each `https://` link tries two sources in order:

1. **The site itself**: `https://<host>/favicon.ico` on the link's own origin. The browser loads it with your normal session, so intranet and signed-in sites that Google cannot reach also get icons. The request goes only to the site the link already points to.
2. **Google's favicon service** (`t2.gstatic.com/faviconV2`), for public hostnames only. Only the scheme and hostname are sent. The `fallback_opts` parameter makes it answer 404 instead of a generic globe when it has no icon.

No path, query, credentials, or referrer is sent to either source. `http://` links skip the first source, because an http image would be mixed content on the https portal page. Other schemes, such as `vscode://`, request no icon. Blocked links show no icon.

A 🌐 emoji reserves the image space and stays visible until an icon loads, or when every source fails. Icons smaller than the display size, such as 16px favicons, are scaled up so that all icons line up, at the cost of some blur. Images smaller than 8 × 8 are treated as placeholders and the next source is tried. Emoji appearance follows the operating system.

IP addresses, single-label hosts, and common local/private suffixes (`localhost`, `.local`, `.internal`, `.lan`, `.home`, `.home.arpa`, `.test`, `.invalid`, `.onion`) never use Google's service; they only try their own `/favicon.ico`. This is a hostname check, not a DNS lookup: a private service under an ordinary public domain cannot be detected this way, and its hostname will be sent to Google.

Images load lazily, independently of the catalog, and use the browser's normal HTTP cache. No image cache or additional OAuth scope is needed in GAS. Sites that keep their icon somewhere other than `/favicon.ico` rely on Google's service. Google's endpoint is undocumented, and its availability and behavior can change.

## Favicon hosting

The GAS page uses a public PNG selected from its saved theme and icon letter. The assets are hosted at `https://hatappo.github.io/gas-portal/favicons/<theme>/<character>.png`. A–Z retain their letter filenames; hiragana and katakana use lowercase Unicode code point filenames, such as `u3042.png` for あ. Supported kana include voiced and semi-voiced letters, small kana, historical ゐ/ゑ and ヰ/ヱ, iteration marks, and ー. Combining dakuten and handakuten are composed before validating the one-character setting. Other characters, including kanji and emoji, remain unchanged in the portal header and use the shared `favicons/fallback.png`: the 玄 glyph from [Kouzan Brush Font Sousho](https://opentype.jp/kouzansousho.htm) by Aoyagi Kouzan in iron indigo on a transparent background. It is identical for all themes; explicitly selecting `P` still uses the normal letter icon. Automatic theme mode uses the Lofi favicon because the initial GAS response cannot read the browser color preference. Reload the page after changing the theme or letter to update the browser tab icon; the browser may also cache the image.

Run `npm run build:favicons` to generate 207 letter PNGs per theme (4,347 for the 21 themes) plus one shared fallback, all at 64 × 64, and a gallery in `site/`. Each theme's icon uses its DaisyUI `primary` color with `primary-content` for the letter; letter outlines use the bundled development dependencies Libre Baskerville (A–Z) and Shippori Mincho (kana). The unchanged fallback glyph outline lives in `src/assets/favicon-fallback.svg` and is rasterized during the build. The font publisher permits commercial and logo use; the original font binary is not bundled. See NOTICE for provenance. No system fonts or rendering service are required, and generated files are not committed or included in the GAS package.

For the upstream repository, select **Settings → Pages → Build and deployment → Source: GitHub Actions** once. After merging the workflow into `main`, the **Favicon assets** workflow builds and publishes only `site/`. It can also be run manually on `main`. The public endpoint must be published before deployed portals can load these favicons. Forks continue to use the upstream image URLs; the publishing job is restricted to the upstream repository.

The browser requests the selected public theme/letter image from GitHub Pages. No tokens, spreadsheet contents, or other settings are included. If image hosting is unavailable, the portal still works, but its tab icon may be missing. Kanji favicons would need additional generated assets or a separately operated image endpoint. Favicons for the palettes used before v0.3.0 (such as `tsuyukusa`) are no longer published, so older deployments show no tab icon until they are updated.

## Contributing

Write documentation, code comments, CLI messages, test names, and commit messages in English. Use Conventional Commits, for example `feat(i18n): add language selection`. Existing Git history is not rewritten solely to translate commit messages.

UI text supports Japanese and English through `src/shared/i18n.js`. Keep translation data, Japanese input aliases, and multilingual test fixtures where needed. Run lint before editing and `npm run check` after changes. New behavior should have meaningful regression coverage.

## License

MIT. See [NOTICE](NOTICE) for icon licensing.
