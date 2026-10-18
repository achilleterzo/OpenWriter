---
# editorInsert.js

Source: [`src/lib/editorInsert.js`](../../../src/lib/editorInsert.js)

Writes a text that may contain Markdown formatting into the editor in place of a range. A plain `insertText` would leave the asterisks as literal text (which become `\*\*` on save) and would lose the formatting of the replaced text.

- `replaceRangeWithMarkdown(editor, from, to, markdown)`: replaces the `from`–`to` range. An empty text deletes the range. A text on a single line is parsed as inline Markdown: if it parses to a single paragraph it is inserted as inline content, and when the text carries no formatting and the replaced text had some, it inherits the marks of the replaced text (replacing a word inside bold text keeps it bold). Multiple lines, or a single line that Markdown turns into a block (heading, list…), are inserted as block Markdown with `insertContentAt`.
- `markdownToPlain(value)`: the same inline Markdown as plain text, for display without asterisks and backslashes.


When the replacement has no formatting of its own, `replaceRangeWithMarkdown` keeps the style word by word: unchanged words keep theirs (via a word diff of old and new text), new ones take the style of the text they replace. `rangeToMarkdown(editor, from, to)` returns a range as inline Markdown with its formatting; the notes panel uses it, with the `InlineMarkdown` component, to show the quoted and proposed text with their styles.
