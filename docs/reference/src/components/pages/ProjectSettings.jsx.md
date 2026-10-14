---

# ProjectSettings.jsx

Source: [`src/components/ProjectSettings.jsx`](../../../../../src/components/ProjectSettings.jsx)

Settings screen section for a project: the settings of the open project, or of another one when `projectPath` is given. Everything is saved in the project's `.ow` folder, so it can be versioned or copied along with the project.

- **Icon and name**: the avatar is the button that chooses an image for the project ([ProjectIcon.jsx](ProjectIcon.jsx.md) and [projectIcons.js](../../lib/projectIcons.js.md); PNG, JPG, GIF, WebP, BMP, ICO, AVIF, SVG), with a small button to remove it; next to it the project name (up to 200 characters).
- **Location**: the project path with the "Move…" button that moves the whole folder, `.ow` included.
- **Inherit the context of the parent project**, shown only for a sub-project: whether the assistant also receives the parent's instructions, followed by this project's, which take precedence.
- **Context for the AI**: the free text in `.ow/context.md` (with the character count against the 20,000 limit), also editable by hand and openable in the editor as a document.
- **AI reply language in this project** and **language of the documents**: the assistant replies in the first one, while rewrites, corrections, new files and proposed replacements are written in the second one; leaving the second empty means "same as the reply language".
- **Spell checker languages in this project**, falling back on the general settings when none is chosen ([SpellcheckLanguages.jsx](SpellcheckLanguages.jsx.md)).
- **Save a version on every save**: automatic versions, capped at 100 per document, oldest automatic ones discarded first.
- **Writing skills**: the project's skills, with the ones the assistant applies by default in every conversation ([SkillsManager.jsx](SkillsManager.jsx.md), `project` scope).

`CopyContext` copies the context from another project of the list, replacing it or appending it, together with the other instruction files and the skills of `.ow` that do not exist yet. Saving goes through the project settings IPC and reports success or the error; the icon and name changes are propagated to the rest of the interface through `onChanged`.