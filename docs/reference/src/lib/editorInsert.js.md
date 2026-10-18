---
# editorInsert.js

Source: [`src/lib/editorInsert.js`](../../../src/lib/editorInsert.js)

Writes a text that may contain Markdown formatting into the editor in place of a range. A plain `insertText` would leave the asterisks as literal text (which become `\*\*` on save) and would lose the formatting of the replaced text.

- `replaceRangeWithMarkdown(editor, from, to, markdown)`: replaces the `from`–`to` range. An empty text deletes the range. A text on a single line is parsed as inline Markdown: if it parses to a single paragraph it is inserted as inline content, and when the text carries no formatting and the replaced text had some, it inherits the marks of the replaced text (replacing a word inside bold text keeps it bold). Multiple lines, or a single line that Markdown turns into a block (heading, list…), are inserted as block Markdown with `insertContentAt`.
- `markdownToPlain(value)`: the same inline Markdown as plain text, for display without asterisks and backslashes.

