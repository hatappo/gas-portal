# Alcove: a multi-page Chrome Side Panel

Alcove embeds HTTPS pages beside your browser tabs. Register a URL and an optional name for each page, then switch pages using the footer selector. It uses WXT + Svelte and remains in this repository during development. The portal UI, service integrations, credentials and data stay in GAS; Alcove does not proxy their APIs.

## Build and open

```sh
npm ci
npm run extension:build
```

In `chrome://extensions`, enable Developer mode and load `extension/.output/chrome-mv3` as an unpacked extension. After rebuilding, reload the extension there. Release archives currently retain the name `gas-portal-side-panel-VERSION-chrome.zip`; this is not a Chrome Web Store release. Versioning and P artwork remain shared until a separate distribution is introduced.

Open the side panel from the toolbar icon. In Settings, register up to 20 HTTPS URLs. Blank names display the URL host (including a non-default port) without fetching page titles. The blank value stays blank in settings, so changing the URL also updates the fallback label. Save to connect; use the footer selector to switch pages. The **Alcove settings** heading distinguishes extension settings from the embedded app. Close settings with its × button. Drag a page card by its grip to reorder it, or focus the grip and press Up/Down. Save to apply the order to the footer selector. URL fields wrap and grow to show their full value. The extension ID is displayed as a read-only field: click or focus to select it, then copy with Ctrl+C or ⌘C. There are no site-specific setup sections or parameter-set settings.

## URL templates

An optional `{nonce}` in the URL is replaced with a fresh random 128-bit hexadecimal value each time a page opens or reloads. Every occurrence in that URL uses the same value. Percent-encoded `%7Bnonce%7D` is accepted and displayed as `{nonce}` in Settings. URLs must use HTTPS, contain no username or password, and have a fixed hostname. Query parameters and fragments are preserved. Never store credentials in a URL.

Pages load lazily on their first selection and stay mounted while the panel document lives. Switching pages only changes visibility; form input, navigation and page state are retained. Hidden frames are inert, but their scripts and network activity may continue subject to browser throttling. Reload replaces only the selected frame and regenerates its nonce. Removing a page or changing its URL discards only that frame; renaming and reordering preserve it. Settings and blackout preserve all loaded frames. Closing/reopening a panel whose document Chrome destroys still reloads the selected page. The **Open tab** action opens the resolved URL, including its query parameters, as registered. Sites can treat embedded URLs differently from their ordinary browser URLs.

Existing single-portal preferences and experimental parameter sets are converted to URL-only page entries on restoration; the next save persists the new format. Alcove has no GAS-specific URL parsing, connection confirmation, readiness timeout or message listener. It cannot reliably distinguish a loaded web app from a login or error page inside a cross-origin iframe.

## Connect GAS Portal

1. Ship the updated portal to expose its **Settings → Extension → Alcove connection URL**.
2. In Alcove Settings, click the Extension ID field and copy it.
3. Add that ID to the portal's **Additional allowed extension ID** and save.
4. Click the portal's connection URL field, copy it, and register it as a page URL in Alcove. It includes `sidePanel=1&panelNonce={nonce}`. The URL is unavailable in local preview or `/dev` deployments.

The ID is stored in the executing user's `SIDE_PANEL_EXTENSION_IDS` User Property. One additional ID can be saved; known official IDs are merged by the portal. Previously stored multi-ID values are rejected until replaced with one ID. The official list is currently empty. An unpacked extension ID can change if its directory changes. Allowlist edits take effect on the next page load without redeploying; removing an ID does not terminate an already-loaded page.

Ordinary portal requests retain GAS's default frame protection. Embedded requests require an allowlist and a valid nonce before loading the catalog. The embedded page starts hidden and checks `location.ancestorOrigins` before mounting: the top ancestor must be an allowlisted extension and intermediate ancestors must be GAS origins. Otherwise the portal displays an inert explanation. This is browser-side embedding protection, not authentication: Google sign-in and deployment access restrictions still apply. The existing portal readiness message remains for earlier clients; Alcove does not consume it.

## Permissions and embedding limits

- Chrome internal pages such as `chrome://extensions/` cannot be embedded; open them in a normal browser tab.
- Iframes are allowed only over HTTPS. Their sandbox permits scripts, same-origin behavior, forms, downloads and external popups, but not arbitrary top-level navigation.
- Extension scripts are local only. There are no content scripts or response-header rewriting rules. Alcove does not bypass `X-Frame-Options` or CSP restrictions.
- Production permissions are `sidePanel`, `storage`, and the existing host access for `script.google.com` and `*.googleusercontent.com`, retained for embedded Google authentication/storage behavior. Generic sites do not receive broad host access. Login or organization policies may still prevent embedding.
- Sign-in screens may require opening the site's ordinary URL in a browser tab. Do not make a private portal public or disable browser security to work around this.
- Closing the side panel can destroy its document. Reopening restores the selected page but reloads it. This is not an always-on background notification service.

## Controls and privacy

The footer contains the page selector and buttons for blackout, opening a tab, reloading and settings. Page selection is disabled while editing settings or blacked out. Language defaults to the browser, with Japanese and English options; this affects extension controls only and is saved locally.

Click the eye button once to hide all content and double-click to restore it. Enter or Space can activate it once/twice as well; held keys do not toggle. The icon reflects the current state and previews the opposite state on hover/focus. Content remains mounted, with interaction and focus disabled. Page names in the selector are concealed too. This does not log out or pause the embedded app.

Blackout is synchronized through `chrome.storage.session` between this extension's panels. It survives panel closure but clears on browser restart, extension reload, disablement or update. Startup remains concealed until the preference is restored; storage failures keep it concealed. Chrome's own side-panel header is outside the extension's control.

## Checks

```sh
npm run extension:check
npm run test:extension
npm run check
```

Browser tests use mocked pages. Verify real Google login and site-specific embedding in your browser. Generated `.wxt` and `.output` assets are ignored; the portal's eight-file GAS output remains unchanged.
