# electron/menu.cjs

Source: [`electron/menu.cjs`](../../../electron/menu.cjs)

Builds the native application menu through `createApplicationMenu(sendCommand, state)`. Commands are sent to the renderer as app command events.

- File: New document (Ctrl+N), Open… (Ctrl+O), Open project folder… (Ctrl+Shift+O), Close tab (Ctrl+W), Save (Ctrl+S), Save as… (Ctrl+Shift+S), Print… (Ctrl+P), an Export submenu — Word document (.docx)…, PDF document (.pdf)…, Markdown with embedded images (.md)… — Settings… (Ctrl+,), Quit.
- Edit: Electron roles for undo, redo, cut, copy, paste, and select all (with explicit translated labels), plus Find… (Ctrl+F) and Replace… (Ctrl+H).
- Help: Check for updates… and About OpenWriter.
- A View menu with the endless and paged (A4) views exists in the code but is hidden while the paged view is unfinished (`PAGES_VIEW_ENABLED`, which mirrors `pagesViewEnabled` in `src/appearance.js`).

Entries with `role` keep an explicit label so the menu follows the app language instead of the system language.