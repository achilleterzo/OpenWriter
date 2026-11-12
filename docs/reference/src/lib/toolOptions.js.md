# toolOptions.js

Source: [`src/lib/toolOptions.js`](../../../../src/lib/toolOptions.js)

The groups of assistant tools as the settings show them: one list, shared by the general settings and by the settings of a single project, so that the two never label the same group differently.

`toolOptions` is an array of `{ key, label, help }`, in the order the switches appear:

- `files` — "Project files": list folders and read the project's files (`.ow` excluded).
- `create` — "Creating files and folders": create Markdown or text documents in the project; existing files are never overwritten.
- `memory` — "Memory": the assistant saves lasting information about the project, linked to the files it applies to, and reads it in every conversation; it can be inspected in the Memory tab.
- `notes` — "Notes in the document": notes and suggestions anchored to the text, accepted or rejected by the user.
- `edit` — "Editing the open document": replace or insert text; edits are undoable with Ctrl+Z, are not saved on their own, and a version is archived before the first one.
- `ask` — "Questions with choices": questions with clickable answers instead of a list of options in the text.
- `vision` — "Images and screenshots": screenshots and images, with a model that can see; images go to the provider, and images from the web are downloaded locally (local addresses are blocked).
- `web` — "Web browsing": DuckDuckGo search, opening pages and reading the browser tabs, including the ones the user opened; local addresses cannot be opened.

`label` and `help` go through `t()`, so they follow the interface language; the keys are the same group names used by the tool catalog ([aiTools.js](aiTools.js.md)) and by the project settings (`ai.tools`, see [project-file.cjs](../../../../electron/project-file.cjs.md), which keeps exactly these keys in `TOOL_GROUPS`). The `research` group has no entry: it is turned on by the research assistant section of the AI settings ([AiProviderSettings.jsx](../components/pages/AiProviderSettings.jsx.md)).