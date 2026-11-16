# Dependency security scanning

Run `npm run security:scan` with OSV-Scanner **2.7.1** on PATH, or set `OSV_SCANNER` to its executable path. Download the matching binary from the [official release](https://github.com/google/osv-scanner/releases/tag/v2.7.1) and verify its SHA-256 against the release checksums before running it. Run `npm ci` first to install the report helper's TOML parser.

```sh
OSV_SCANNER=/absolute/path/to/osv-scanner npm run security:scan
```

The scanner reads the root `package-lock.json` and queries OSV directly; it does not call `npm audit`, run package scripts, or perform call analysis. This is dependency/version matching, not proof of exploitability. It does not audit the developer's Node executable or globally installed npm. Continue updating those separately.

## CI behavior

The `Dependency security` workflow runs on pull requests, pushes to main, daily at 02:23 UTC, and manual dispatch. Every run scans the full lockfile, including PR runs: a new advisory or expired exception must remain visible even if the dependency did not change in that PR. It is independent of build/test CI.

The workflow downloads a version-pinned scanner and verifies a pinned SHA-256. Both scans use the same executable and lockfile:

1. Scan with an empty configuration to retain every finding.
2. Scan with `osv-scanner.toml` to apply reviewed exceptions.
3. Compare results and write the Actions job summary: requires action, temporarily accepted, and expired exceptions. Accepted findings include their reason and deadline; unmatched exceptions are also listed for cleanup.

Any remaining vulnerability, expired exception, invalid configuration, missing package data, unexpected filtering, or scanner failure fails the check. Expiry starts at 00:00 UTC on the listed date. An expired exception still requires removal or review when its vulnerability is no longer present. Network errors and timeouts never become a clean result.

`security-reports/` contains raw/filtered JSON, logs, the exact policy, and the Markdown summary. It is ignored by Git and uploaded as a GitHub Actions artifact for 30 days, including failed runs when reports exist. Installation failures appear in the failing setup step and may produce no artifact. Local runs replace previous reports to avoid stale success results.

This initial integration uses PR Checks, Actions summaries and downloadable artifacts. It does **not** upload SARIF to Code scanning or modify Dependabot alerts. A repository administrator can make the security job a required check using branch rules; adding the workflow alone does not block merges. Scheduled runs begin after the workflow is merged into the default branch.

## Reviewing exceptions

Only advisory-specific `[[IgnoredVulns]]` entries are allowed. Every entry requires a unique ID, a reason, and a date:

```toml
[[IgnoredVulns]]
id = "GHSA-example-example-example"
effectiveUntil = 2027-02-16
reason = "Describe the affected dependency path, current exposure, and conditions requiring reassessment."
```

Risk acceptance means **temporarily accepted, not fixed**. The initial four exceptions cover the reviewed clasp/build-tool dependency paths and expire on February 16, 2027 (three months after the initial review). They are not a blanket exemption for development dependencies. New advisories remain actionable. OSV matches advisory aliases too; an exception is advisory-wide, not limited to the package version mentioned in its reason. Review exceptions whenever dependency paths, affected versions, CLI/MCP use, or build inputs change. Do not assume those changes are detected as a change in exploitability automatically.

Review the full report before extending a deadline. Remove exceptions after a fix, record updated reasoning when exposure changes, and do not automatically renew dates. Reason and date changes are ordinary reviewable Git diffs. For stronger version/path-specific enforcement, add a separate check before expanding this policy.

OSV and npm audit may use different advisory data and severity scores. npm audit also flags dependent packages; this summary counts unique package/version/advisory findings. The initial baseline is four OSV findings versus ten npm audit package entries. OSV exceptions do not suppress npm audit or Dependabot warnings.

## Maintenance

- Upgrade the scanner deliberately: update the version guard in `scripts/security-scan.mjs`, workflow download URL/checksum, this guide, and the runner test fixture together.
- Run `npm run check` and a live `npm run security:scan` after scanner/configuration changes.
- Run `gh actions-lock` after changing workflow action references, then `gh actions-lock --verify`.
- Keep complete reports as evidence; do not add service tokens, environment dumps, or application data to them.
