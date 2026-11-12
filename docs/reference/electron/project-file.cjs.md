# electron/project-file.cjs

Source: [`electron/project-file.cjs`](../../../electron/project-file.cjs)

Owns the `.ow` project directory (format version 1). Its layout:

```text
.ow/
  project.json
  context.md
  skills/<id>.md
  history/<document-path>/index.json
  history/<document-path>/<version-id>.md
```

- Settings in `project.json`: name (max 200 chars), `ai` (assistant and document language, `temperature`, `autoApprove` and `tools`), `options.autoVersions`, `options.searchIndex` (the relevance search index of the project, on unless turned off; `saveSettings` leaves it as it is when the caller does not pass it; `searchIndexEnabled()` reads it), `options.sharedKnowledge` (the other projects can search this one and read it read-only, on unless turned off; same rule; `sharedKnowledgeEnabled()` is true only with the index on too, see [shared-knowledge.cjs](shared-knowledge.cjs.md)), `spellcheck.languages`, `skills.active` (writing skills active by default, see [skills-store.cjs](skills-store.cjs.md)), `quickActions` and `editor` (the font of the project: a generic `font` of `sans`, `serif`, `mono`, plus a Google `fontFamily` by name; empty means the general settings apply). 

    Unknown keys are preserved. `saveSettings` changes `skills.active` only when `skills` is passed; `setActiveSkills(ids)` saves it alone; `setQuickActions(value)` saves the project quick actions alone; `setAiOptions({ autoApprove, tools })` saves the approval and the tool groups alone (the chat does it from its own options), returning the cleaned values.
  - `ai.temperature`: the temperature level of the project, 0–1 or `''` for no choice, cleaned by `cleanTemperature` ([temperature.cjs](temperature.cjs.md)). It is inherited by the conversations of the project and, in its absence, the general temperature of the provider applies. `getTemperature()` reads it without throwing (an unreadable `project.json` must not block the chat) and returns `''` when no project is open.
  - `ai.autoApprove`: `''` (as in the general settings), `'on'` (the assistant's edits are accepted and saved at the end of the work) or `'off'` (they stay to review), cleaned by `cleanAutoApprove`.
  - `ai.tools`: only the explicit choices of the project, one boolean per group of `TOOL_GROUPS` (`files`, `create`, `memory`, `notes`, `edit`, `ask`, `vision`, `web`) — `cleanTools` keeps nothing else, so a group the project does not set inherits the general settings ([toolOptions.js](../../src/lib/toolOptions.js.md)).
  - `saveSettings` touches `temperature`, `autoApprove` and `tools` only when the corresponding key is in the `ai` object it receives, as it does for `skills` and `editor`: a caller that does not pass them (the copy of the context, for instance) leaves them as they are.
  - Project quick actions (`quickActions`, cleaned by `cleanQuickActions`): `{ actions: [{ id, label, prompt }], general }`, at most 12 actions (`MAX_PROJECT_QUICK_ACTIONS`), label max 40 and prompt max 2,000 characters, an invalid or repeated id replaced by `project-<random>`; `general` (true unless set to false) decides whether the general actions also appear in this project's chat ([quickActions.js](../../src/lib/quickActions.js.md)).

   `context.md` holds the assistant context capped at 20,000 characters. Writes are atomic ([atomic-write.cjs](atomic-write.cjs.md)); corrupt JSON raises instead of overwriting user data; on Windows the directory gets the hidden attribute.
- initialize: creates the base files when missing and leaves everything else untouched.
- History versions (`addVersion`): skipped when identical to the latest text (unless labelled); each entry stores id (UUID), timestamp, label (max 120), `auto` flag, and size. Up to 100 versions per document (`MAX_VERSIONS_PER_DOCUMENT`): beyond that, oldest automatic versions are discarded first, then the oldest overall. Keys are project-relative paths, so history mirrors the folder structure; reads verify the id against the index, so lookups cannot escape the history directory.
- `moveHistory(from, to)`: carries a document's history directory along on rename/move.
- `getContextChain(document)`: the `.ow` chain from the outermost to the one nearest to the document; each entry carries `path`, `base` (absolute folder), `name`, `context`, `extraContext`, languages and `activeSkills`.
- Exposed: `directoryName`, `initialize`, `moveHistory`, `getSettings` (with `context` text, `skills.active` and `quickActions`), `getTemperature`, `getContextChain`, `saveSettings`, `setQuickActions`, `setAiOptions`, `setActiveSkills`, `autoVersionsEnabled`, `searchIndexEnabled`, `sharedKnowledgeEnabled`, `addVersion`, `listVersions` (newest first), `getVersion`, `deleteVersion` (removing the directory when the last version goes, deleting the index too).

The search by meaning is **not** a project option: it is decided only in Settings → Local models (a model, a device, for every project). Older versions wrote `options.semanticSearch` in `project.json`; it is ignored and removed the next time the settings are saved.