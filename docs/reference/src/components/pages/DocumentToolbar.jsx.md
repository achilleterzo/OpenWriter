# DocumentToolbar.jsx

Source: [`src/components/DocumentToolbar.jsx`](../../../../../src/components/DocumentToolbar.jsx)

Formatting toolbar above the editor, reflecting the current selection through `useEditorState`. It is a single wrapping bar built from `ToolbarGroup` blocks ([ToolbarButton.jsx](ToolbarButton.jsx.md)), so a line break never splits a group.

- Save, highlighted while the document has unsaved changes.
- Block type dropdown: Paragraph plus H1–H7 (`setParagraph` / `setHeading`).
- Inline marks: bold, italic, strikethrough, inline code, and links (set through a URL prompt; pressing again on a link removes it); image insertion delegated to the `onImage` handler.
- Blocks: bulleted list, numbered list, task list, blockquote, code block, and horizontal rule.
- Undo and redo.
- Find and replace toggle, highlighted while the bar is open (`findOpen`), and the button that switches to the Markdown source view.

In the source view the toolbar shrinks to save, "Copy all" (confirming with a check for a moment) and the return to the formatted view, with the note that the Markdown source is applied to the document as you type.