---

# electron/updates.cjs

Source: [`electron/updates.cjs`](../../../electron/updates.cjs)

Checks for a new version through the public GitHub releases of `achilleterzo/OpenWriter`. The application does not update itself: it opens the download page.

- `fetchLatestRelease()`: the latest published (non-draft) release that actually carries a downloadable package, as `{ version, tag, url, name, notes }`, or `null` when there is nothing to download yet (not an error). Releases are read from the GitHub API (15 s timeout, 30 candidates) and only those with an uploaded, non-empty asset with an installer extension (`exe`, `msi`, `dmg`, `appimage`, `deb`, `zip`) are kept; among them the highest version wins.
- `compareVersions(left, right)`: compares two versions on the first three numeric components, ignoring a leading `v` and any suffix.
- `REPOSITORY`: the `owner/name` of the GitHub repository that is checked.

`releaseVersion(value)` is the internal helper that extracts the numeric version from a tag.

