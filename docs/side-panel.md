# Connect this portal to Alcove

[Alcove](https://github.com/hatappo/alcove) is an independently maintained Chrome Side Panel extension for HTTPS web apps. Its source, build commands, browser tests, and development ZIP releases now live in that repository. gas-portal no longer builds or distributes the extension; v0.15.0 is the last release with a bundled extension archive.

## Setup

1. Install or build Alcove using its README. It is not yet published on the Chrome Web Store.
2. Ship this portal and open its deployed `/exec` URL in a normal browser tab.
3. In Alcove settings, click the **Extension ID** field and copy it.
4. In the portal's **Settings → Extension → Alcove Chrome extension**, paste it into **Additional allowed extension ID** and save.
5. Click the portal's **Alcove connection URL**, copy it, and register it as a page URL in Alcove. It includes `sidePanel=1&panelNonce={nonce}`. The URL is unavailable in local preview or `/dev` deployments.

The additional ID belongs to the executing user's `SIDE_PANEL_EXTENSION_IDS` User Property. One ID can be saved; known official IDs are merged by the portal. Previously stored multi-ID values are rejected until replaced with one ID. The official list is currently empty. Allowlist edits take effect on the next page load without redeploying; removing an ID does not terminate an already-loaded page.

## Moving from the bundled extension

Build Alcove from its own repository and load its `extension/.output/chrome-mv3` directory. Moving the unpacked extension directory can change its ID and its local settings storage. Keep the old installation until you have copied its registered page URLs and checked the new installation. Register the new ID in the portal before opening it through Alcove.

## Embedding protection

Ordinary portal requests retain GAS's default frame protection. Embedded requests require an allowlist and a valid nonce before loading the catalog. The embedded page starts hidden and checks `location.ancestorOrigins` before mounting: the top ancestor must be an allowlisted extension and intermediate ancestors must be GAS origins. Otherwise the portal displays an inert explanation.

This is browser-side embedding protection, not authentication. Google sign-in and deployment access restrictions still apply. Keep the web app private; do not weaken Google account or browser security to work around embedding errors. Sign-in may require opening the ordinary portal URL in a normal tab first. Organization policies may prevent embedding.

The portal's existing readiness message remains available for earlier clients; Alcove does not consume it. Portal service tokens remain in GAS and are not copied into the extension's configuration. The eight-file GAS output contract is unchanged.
