# TextFormatStatus.jsx

Source: [`src/components/TextFormatStatus.jsx`](../../../../src/components/TextFormatStatus.jsx)

The line ending and the encoding of the open text file, at the bottom right of the status bar as in code editors. It is shown by [App.jsx](../../App.jsx.md) when the active tab is a text tab ([TextPane.jsx](TextPane.jsx.md)) and the home is not open.

- Two text buttons: the line ending (`LF` or `CRLF`) and the encoding (`UTF-8` or `UTF-8 BOM`). A click opens a menu above the button (`above` of [ContextMenu.jsx](ContextMenu.jsx.md)) with the choices and a check mark on the current one: LF (Unix, macOS) and CRLF (Windows); UTF-8 and UTF-8 BOM. The buttons do not take the focus, so the text field keeps its selection. They are disabled on a read-only tab.
- The choice goes to `workspace.setTextFormat(id, { eol, bom })`, which changes the tab; it is how the file is written at the next save, and it counts as a modification even if the text is the same (the tab remembers `savedEol` and `savedBom`, what is on the disk, and TextPane marks it modified or clean again when they match).
