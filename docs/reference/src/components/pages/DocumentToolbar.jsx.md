# DocumentToolbar.jsx

Source: [`src/components/DocumentToolbar.jsx`](../../../../../src/components/DocumentToolbar.jsx)

Formatting toolbar above the editor, reflecting the current selection through `useEditorState`.

- Block type dropdown: Paragraph plus H1–H7 (`setParagraph` / `setHeading`).
- Inline marks: bold, italic, strikethrough, inline code, and links (set through a URL prompt; toggling removes an existing link); image insertion delegated to the `onImage` handler.
- Blocks: bulleted and numbered lists, blockquote, code block, and horizontal rule.
- Undo and redo, then a find-and-replace toggle button that reports `onFind` and highlights when the bar is open (`findOpen`).

Buttons come from `ToolbarButton`, labels from the i18n runtime.