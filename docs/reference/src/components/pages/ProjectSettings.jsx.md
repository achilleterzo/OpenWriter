# ProjectSettings.jsx

Source: [`src/components/ProjectSettings.jsx`](../../../../../src/components/ProjectSettings.jsx)

Settings screen section for a project: the settings of the open project, or of another one when `projectPath` is given. Everything is saved in the project's `.ow` folder, so it can be versioned or copied along with the project. With `embedded` (used inside [ProjectSettingsDialog.jsx](ProjectSettingsDialog.jsx.md)) it drops its own border and background, as the window already provides them and scrolls.

- **Icon and name**: the avatar is the button that chooses an image for the project ([ProjectIcon.jsx](ProjectIcon.jsx.md) and [projectIcons.js](../../lib/projectIcons.js.md); PNG, JPG, GIF, WebP, BMP, ICO, AVIF, SVG), with a small button to remove it; next to it the project name (up to 200 characters).
- **Location**: the project path with the "Move…" button that moves the whole folder, `.ow` included.
- **Inherit the context of the parent project**, shown only for a sub-project: whether the assistant also receives the parent's instructions, followed by this project's, which take precedence.
- **Context for the AI**: the free text in `.ow/context.md` (with the character count against the 20,000 limit), also editable by hand and openable in the editor as a document.
- **AI reply language in this project** and **language of the documents**: the assistant replies in the first one, while rewrites, corrections, new files and proposed replacements are written in the second one; leaving the second empty means "same as the reply language".
- **Spell checker languages in this project**, falling back on the general settings when none is chosen ([SpellcheckLanguages.jsx](SpellcheckLanguages.jsx.md)).
- **Editor font in this project**: the same choice as in the appearance settings ([FontPicker.jsx](FontPicker.jsx.md)), with the "default" option; it overrides the general font while this project is open, and changes as soon as it is saved.
- **Save a version on every save**: automatic versions, capped at 100 per document, oldest automatic ones discarded first.
- **Writing skills**: the project's skills, with the ones the assistant applies by default in every conversation ([SkillsManager.jsx](SkillsManager.jsx.md), `project` scope).
- **Share the project setup** (`ShareSetup`): exports the context, the other instruction files, the project skills and the settings to a single file ([project-pack.cjs](../../../electron/project-pack.cjs.md)) and imports one, showing what it contains (context length, instruction files, skills) and asking whether to replace or append the context, apply the settings, and overwrite files that already exist.
- **Copy the context from another project** (`CopyContext`): copies the context, the other instruction files and the missing skills of `.ow`, replacing or appending the context.

Saving goes through the project settings IPC and reports success or the error; icon, name and font changes are propagated to the rest of the interface through `onChanged`.
**Search index** (`SearchIndex`): a checkbox for `options.searchIndex` (saved with the other settings, in `.ow/project.json`, so the choice travels with the project), the state of the index read with `getKnowledgeStatus` (documents, passages, last update; refreshed every 4 s because the first scan runs after the project opens) and a "Rebuild the index" button (`rebuildKnowledge`: clears the project in the index and scans the files again). The index is a copy kept outside the project (`knowledge.db` in the user data folder, see [knowledge-index.cjs](../../../electron/knowledge-index.cjs.md)); turning it off empties the project's entries, and the assistant tool answers that it is off.

**Share with the other projects** (inside `SearchIndex`, shown when the index is on): a checkbox for `options.sharedKnowledge` (on by default). The assistant of the other projects (and external agents through MCP) can find passages of this one and read them read-only; what it finds can reach the AI model of those conversations, so it is turned off for reserved material. Turning the index off removes the project from every search anyway. See [shared-knowledge.cjs](../../../electron/shared-knowledge.cjs.md).

**Search by meaning** (`SemanticStatus`, inside `SearchIndex`, shown when the index is on): one read-only line, no controls, because the search by meaning is decided only in Settings → Local models ([LocalModelsSettings.jsx](LocalModelsSettings.jsx.md)): the model, its download and removal, the device and the global switch. The line says "active (CPU or graphics card)" with the passages understood so far (`getSemanticStatus`), that the model is not installed (and where to download it), that it is turned off in Settings → Local models, or that the graphics card failed and the CPU is used. Every project with the index on has its own vectors; to leave a project out, turn its index off.

The project name field is an input group with a decorative `@` prefix (purely aesthetic: it is not stored, a leading `@` that is typed is dropped). The name is shown in the projects list, the Home graph and the explorer header instead of the folder name.

If no name has been chosen, the name field starts filled with the folder name. A name equal to the folder name is not saved (the project keeps following the folder if it is renamed or moved); any other name is saved and used in the lists, the graph, the explorer and by agents (`project_info`, and the `@alias` of the project in the searches of other projects).

The "Save settings" button (on the right, after the "Saved" confirmation or any error) sits in a footer that stays at the bottom of the scrolling area (`sticky`), so it is always in view however long the settings are.

Where the save button goes: inside the general settings window it is at the right of the window header ([SettingsActions.jsx](SettingsActions.jsx.md)); in the window of a single project, which has no such header, it stays in the footer of the window, outside the scrolling area (so the scrollbar stays in the body).

`onSaved` is called after a successful save; whoever hosts the settings can close them (the single-project window does).
