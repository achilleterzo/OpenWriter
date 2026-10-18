# SelectionToolbar.jsx

Source: [`src/components/SelectionToolbar.jsx`](../../../../../src/components/SelectionToolbar.jsx)

The floating bar of the selection: it appears when the selection settles, drawn by [FloatingToolbar.jsx](FloatingToolbar.jsx.md).

- With text selected it offers bold, italic, strikethrough, inline code, footnote insertion, and the link; inside a link it shows where it points, with buttons to edit, open and remove it. `Ctrl+K`, or the document toolbar (`request` changes at every request), opens the link editing even with an empty cursor, to insert a new one.
- Editing a link shows the text (when the mode allows changing it) and the address, with Apply and Cancel; Enter applies, Escape cancels, and moving the selection outside the range abandons the edit. An address typed by hand is completed: `example.com` becomes `https://example.com`, an e-mail address gets `mailto:`, while schemes, paths and anchors are kept as they are.
- With an image selected the text tools give way to its own: edit description and title (the alt text in a text area, the title on one line, both cleaned of the characters that would break the Markdown syntax), add, edit, open or remove the link, choose another image, remove it.
- While editing, the bar stays open; otherwise it appears only once the selection is still (the mouse released and no change for a moment), so that it does not jump while dragging or extending the selection with the keyboard.
