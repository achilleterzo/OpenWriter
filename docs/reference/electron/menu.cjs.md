# electron/menu.cjs

Source: [`electron/menu.cjs`](../../electron/menu.cjs)

Builds the native application menu through `createApplicationMenu(sendCommand)`. Commands are sent to the renderer as app command events.

- File: New document (Ctrl+N), Open… (Ctrl+O), Open project folder… (Ctrl+Shift+O), Close tab (Ctrl+W), Save (Ctrl+S), Save as… (Ctrl+Shift+S), Export DOCX…, Export PDF…, Settings… (Ctrl+,), Quit.
- Edit: Electron roles for undo, redo, cut, copy, paste, and select all (with explicit translated labels), plus Find… (Ctrl+F) and Replace… (Ctrl+H).

Entries with `role` keep an explicit label so the menu follows the app language instead of the system language.