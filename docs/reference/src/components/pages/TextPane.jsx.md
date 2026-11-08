
# TextPane.jsx

Source: [`src/components/TextPane.jsx`](../../../../../src/components/TextPane.jsx)

The text reader: a tab for any file that is not a document (code, configuration, logs, `.txt`…), read and edited as it is, never interpreted as Markdown. It reuses the field of the Markdown source view ([SourceEditor.jsx](SourceEditor.jsx.md)).

- **Bar:** file name, lines, size, line ending (LF or CRLF) and encoding (UTF-8, with or without signature); the buttons for **line numbers** (on or off, remembered in `localStorage`, shared by all text tabs), **find and replace**, **save**, and show in the file manager.
- **Find and replace** (Ctrl+F, Ctrl+H, or the button): the same bar as the documents ([FindPanel.jsx](FindPanel.jsx.md)) with match case, whole word, and regular expression, driven by [TextFindBar.jsx](TextFindBar.jsx.md) and [textSearch.js](../../lib/textSearch.js.md). The matches are highlighted behind the field and the current one is brought into view; with a regular expression the replacement accepts `$1`, `$&`, `$<name>`.
- **State:** the text lives in the field. The application asks for it (`getText`, through a registry in `App.jsx`) to save and to keep a draft in the session; it receives only the passages from clean to modified (`onDirty`, `onClean`). The tab is mounted as long as it is open, like the images.
- **Saving:** Ctrl+S (or the button) writes the file with its own line endings and signature ([text-file.cjs](../../../electron/text-file.cjs.md)); "Save as…" asks where. Unsaved changes are asked about when closing, listed by "Save all", and kept in the session as a draft.

Limits: a file over 1 MB or not in UTF-8 is not opened (the reason is shown); the assistant and the agents do not see these tabs (they work on documents: for them a file is opened as a document, see `asDocument` in `openFromExplorer`).
