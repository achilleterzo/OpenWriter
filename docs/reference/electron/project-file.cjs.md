# electron/project-file.cjs

Source: [`electron/project-file.cjs`](../../electron/project-file.cjs)

Owns the `.ow` project directory. Its layout:

```text
.ow/
  project.json
  context.md
  history/<document-path>/index.json
  history/<document-path>/<version-id>.md
```

- Settings are stored in `project.json` with name, AI language settings, `options.autoVersions`, and spell-check languages. Unknown keys are preserved, writes are atomic through a temp-file rename, and JSON parse errors raise instead of overwriting user data.
- `context.md` holds the free-text assistant context, capped at 20,000 characters.
- History versions are saved when the text changes and on manual labelling. Each document keeps up to 100 versions; beyond the limit the oldest automatic versions are discarded first.
- On Windows the directory receives the hidden attribute.
- Rename and move of a document carry its `history/<path>` directory along, so history is never orphaned.

Exposes initialize, getSettings, saveSettings, moveHistory, and the version operations addVersion, listVersions, getVersion, deleteVersion.