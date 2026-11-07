# electron/menu.cjs

Source: [`electron/menu.cjs`](../../../electron/menu.cjs)

Builds the native application menu through `createApplicationMenu(sendCommand, state)`. Commands are sent to the renderer as app command events.

- File: New document (Ctrl+N), Open… (Ctrl+O), Open project folder… (Ctrl+Shift+O), Close tab (Ctrl+W), Save (Ctrl+S), Save as… (Ctrl+Shift+S), Print… (Ctrl+P), an Export submenu — Word document (.docx)…, PDF document (.pdf)…, Markdown with embedded images (.md)… — Settings… (Ctrl+,), Quit.
- Edit: Electron roles for undo, redo, cut, copy, paste, and select all (with explicit translated labels), plus Find… (Ctrl+F) and Replace… (Ctrl+H).
- Help: Check for updates… and About OpenWriter.
- A View menu with the endless and paged (A4) views exists in the code but is hidden while the paged view is unfinished (`PAGES_VIEW_ENABLED`, which mirrors `pagesViewEnabled` in `src/appearance.js`).

Entries with `role` keep an explicit label so the menu follows the app language instead of the system language.
`state.home`: when the projects Home is open the document is not visible, so the items that act on it are disabled (greyed): in Edit, Undo, Redo, Find and Replace; in File, Close tab, Save, Save as, Print and Export. Cut, Copy, Paste and Select all stay on: they work on the focused text field (the Home search bar) and cannot reach a document that is not on screen. [main.cjs](main.cjs.md) rebuilds the menu when the interface reports the change (`home:changed`, `setHomeOpen` in [preload.cjs](preload.cjs.md)).
