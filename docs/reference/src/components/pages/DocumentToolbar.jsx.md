# DocumentToolbar.jsx

Source: [`src/components/DocumentToolbar.jsx`](../../../../../src/components/DocumentToolbar.jsx)

Formatting toolbar above the editor, reflecting the current selection through `useEditorState`. It is a single wrapping bar built from `ToolbarGroup` blocks ([ToolbarButton.jsx](ToolbarButton.jsx.md)), so a line break never splits a group.

- Save, highlighted while the document has unsaved changes.
- Block type dropdown: Paragraph plus H1–H7 (`setParagraph` / `setHeading`).
- Text alignment through a [ToolbarMenu.jsx](ToolbarMenu.jsx.md) showing the icon of the current choice: left, centre, right, justified, with their shortcuts.
- Inline marks: bold, italic, strikethrough, inline code, the link (Ctrl+K, handled by the selection bar), image insertion, footnote insertion.
- Blocks: a list menu (bulleted, numbered, task — choosing the current type again removes the list), blockquote, code block, horizontal rule, and table insertion.
- When the cursor is in a table, a further group appears: add a row below, add a column to the right, delete row, delete column, delete the table.
- Undo and redo.
- Find and replace toggle, highlighted while the bar is open (`findOpen`), and the button that switches to the Markdown source view.
- The AI-likelihood check: the button that runs it and, once there is a result, `AiScoreBadge` — a coloured pill (`AI 42%`, with `?` at low confidence and "(outdated)" when the text changed since the check) whose tooltip gives the score, the confidence, the rationale and the reminder that it is only an indication.

In the source view the toolbar shrinks to save, "Copy all" (confirming with a check for a moment) and the return to the formatted view, with the note that the Markdown source is applied to the document as you type.