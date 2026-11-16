# Chrome Side Panel prototype

The extension embeds the existing GAS web app. It does not build a second portal or proxy its APIs: Svelte/Skeleton UI, service integrations, caching, settings, and credentials remain in the deployed GAS app. The extension stores a deployment URL and its own language preference in Chrome's local extension storage.

[WXT](https://wxt.dev/guide/essentials/frontend-frameworks) provides Manifest V3 builds, the background entrypoint, and Svelte support on Vite. The extension and portal share the translation catalog, theme styles, and readiness protocol. Existing service RPC interfaces remain unchanged.

This is an unpacked Chrome prototype, not a Chrome Web Store release. Automated tests exercise a mocked GAS page; real Google authentication and embedding must be checked in your own browser.

## Build and connect

1. In the **gas-portal source repository**, install dependencies and build:

   ```sh
   npm ci
   npm run extension:build
   ```

2. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**. Select `extension/.output/chrome-mv3` inside this repository.
3. Pin the extension if desired and click its toolbar icon to open the side panel. Its **Settings** screen displays its extension ID. You can also find it on `chrome://extensions`.
4. The consumer must depend on this feature branch locally until a release includes it. Run `npm run build` in the source repository, then `npm run ship` in the consumer once to deploy this feature. No extension ID belongs in the consumer's `package.json`.
5. Open the web app in a normal Chrome tab. Sign in with the correct Google account and complete any authorization there. In **Settings → Extension**, add the ID to **Additional allowed extension IDs** and save. Enter one ID per line, up to 10. Keep the deployment private; this feature does not require public access.
6. Paste its deployed `https://script.google.com/macros/s/DEPLOYMENT_ID/exec` URL into the extension and select **Save and connect**. Workspace `/a/macros/your-domain/s/…/exec` URLs, account-qualified `/macros/u/1/s/…/exec` URLs and the `authuser` query parameter are also supported, as are the portal's known hash routes.

The extension's **Open tab** action uses the original URL. **Reload** reloads the embedded portal; it does not bypass the portal's service caches. Use the portal's refresh controls for fresh provider data. **Settings** lets you replace the URL without removing the existing connection until you save.

An unpacked extension ID can change when its directory changes unless its manifest pins a key. Register each local build's actual ID in Settings. Changes apply to the next page load: reload the side panel; no rebuild or redeployment is needed. Removing an additional ID denies it on subsequent loads; it does not terminate a page that is already open.

Additional IDs are stored as newline-separated text in the executing user's `SIDE_PANEL_EXTENSION_IDS` User Property, never in Script Properties. Empty input removes all additional IDs. Invalid values are rejected without changing saved settings. Known official Web Store IDs are maintained in `src/shared/side-panel.js` and merged with additional IDs, with duplicates removed. The official list is currently empty because no store release exists yet. User settings cannot remove official IDs.

## Authentication and embedding limits

- The extension does not collect Google cookies, read authentication tokens, inject content scripts, or use a separate OAuth client. The embedded GAS page uses the normal browser session and Google authorization.
- Google sign-in screens may refuse iframe display. Sign in through **Open tab** and retry. If that still fails, check the configured ID, deployed version, and browser cookie/organization policies. Do not make the web app public or disable browser security to work around this.
- After 15 seconds without a valid readiness message, the extension shows troubleshooting guidance. An iframe `load` event is not treated as successful authentication. The portal sends only a message type and random per-load nonce, not account or service data.
- The side panel is browser UI, not an always-on desktop process. Closing it or Chrome can stop page timers and in-page calendar notices. It is not a background notification service.

## Embedding controls

Ordinary web app requests retain GAS's default frame policy. Only requests with `sidePanel=1` and a valid per-load nonce may use `ALLOWALL`, and only when the effective allowlist contains at least one extension ID. Invalid requests stop before reading the catalog.

Because GAS does not offer an origin allowlist in `XFrameOptionsMode`, the opt-in page starts hidden. Before mounting the UI or starting client RPCs, it checks Chrome's `location.ancestorOrigins`: the top ancestor must be an allowlisted extension, and intermediate ancestors must be GAS origins. Other frames get an inert message. The readiness reply targets only the validated parent extension origin, never a wildcard. This is browser-side clickjacking protection, not server-side access control; Google authentication and deployment access settings still enforce access. The deployment URL and extension ID are not secrets.

The extension iframe is sandboxed: scripts, same-origin behavior, forms, downloads, and external popup links are allowed, but arbitrary top-level navigation is not. Its CSP allows local extension scripts and GAS frames only. Production permissions are `sidePanel`, `storage`, and host access for `script.google.com` and `*.googleusercontent.com`. The latter accommodates Google's generated Apps Script content hosts; the extension does not inspect unrelated Googleusercontent pages. Host permissions can affect embedded-site cookie/storage behavior, but do not guarantee that Google login will work in every managed browser.

Releases include `gas-portal-side-panel-VERSION-chrome.zip`. Extract it into a stable directory, then load that directory as an unpacked extension in Chrome. This is not a Chrome Web Store release; its local extension ID still needs to be allowed in the portal.

## Development and checks

```sh
npm run extension:dev    # WXT development build; use its printed output directory
npm run extension:check # Typecheck the extension
npm run test:extension  # Production build plus Chromium extension tests
npm run extension:zip   # Optional unpackable production archive
npm run check          # Existing portal checks, including the embedding contract
```

Use the production build for the initial real-account test. WXT development mode can add development-only permissions and reload behavior. Generated `.wxt` and `.output` directories are ignored by Git. The extension version follows the repository package version; the published portal package keeps its eight-file GAS output and does not include extension build dependencies at runtime.

The toolbar and extension-management icons reuse the portal’s default P favicon. WXT builds rasterize the shared vector artwork at 16, 32, 48, and 128 pixels and include the font license. Generated images stay in ignored build directories.

Extension Settings offer Automatic (browser), Japanese, and English. Automatic is the default. This preference is stored locally by Chrome and does not change the GAS portal language. Footer icons open a browser tab, reload the portal, or toggle Settings; hovering displays their labels. Toggling Settings or changing the extension language preserves the existing portal iframe.

Closing the Chrome side panel can destroy its document. Reopening then creates a new extension page and GAS iframe, restoring the saved URL and extension language. This does not force-refresh service caches, but the GAS page itself must load again.

The compact footer uses the manifest name, GAS Portal Side Panel. The leftmost footer button shows the current visibility (eye for visible, crossed-out eye for hidden); hover or keyboard focus previews the opposite state. Click once to black out the entire content area (including settings), and double-click to restore it. Keyboard and touch users can activate once to hide, or twice within 400 ms to restore; holding a key does not toggle it. The content stays mounted, with interaction and focus disabled while hidden. This hides the display only: it does not log out, pause the portal, or affect Google authorization. Chrome's own side panel header is outside the extension's control.

Blackout is shared between this extension's open panels and retained in `chrome.storage.session` while Chrome is running. Closing and reopening the panel preserves it. Browser restart, extension reload, disablement, or update clears session storage. Startup stays concealed until the preference is read. Read/save failures keep content concealed and show recovery guidance beside the restore button.

In the portal’s Settings → Extension, copy the Connection URL and paste it into the extension settings. GAS supplies the deployed URL; no property needs to be configured. Local preview and `/dev` test deployments do not offer a connection URL. If clipboard access is blocked, the field is selected for manual copying.

At compact widths, the portal header uses three icon-only Skeleton segments for Links, Inbox & Tasks, and Settings. The calendar toggle stays alongside them. The selected segment follows URL history; arrow keys switch sections, and resizing preserves keyboard focus and unsaved form drafts.
