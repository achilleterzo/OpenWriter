# electron/project-file.cjs

Source: [`electron/project-file.cjs`](../../electron/project-file.cjs)

Owns the `.ow` project directory (format version 1). Its layout:

```text
.ow/
  project.json
  context.md
  history/<document-path>/index.json
  history/<document-path>/<version-id>.md
```

- Settings in `project.json`: name (max 200 chars), `ai` (assistant and document language), `options.autoVersions`, and `spellcheck.languages`; unknown keys are preserved. `context.md` holds the assistant context capped at 20,000 characters. Writes are atomic (temp file + rename); corrupt JSON raises instead of overwriting user data; on Windows the directory gets the hidden attribute.
- initialize: creates the base files when missing and leaves everything else untouched.
- History versions (`addVersion`): skipped when identical to the latest text (unless labelled); each entry stores id (UUID), timestamp, label (max 120), `auto` flag, and size. Up to 100 versions per document (`MAX_VERSIONS_PER_DOCUMENT`): beyond that, oldest automatic versions are discarded first, then the oldest overall. Keys are project-relative paths, so history mirrors the folder structure; reads verify the id against the index, so lookups cannot escape the history directory.
- `moveHistory(from, to)`: carries a document's history directory along on rename/move.
- Exposed: `directoryName`, `initialize`, `moveHistory`, `getSettings` (with `context` text), `saveSettings`, `autoVersionsEnabled`, `addVersion`, `listVersions` (newest first), `getVersion`, `deleteVersion` (removing the directory when the last version goes, deleting the index too).

