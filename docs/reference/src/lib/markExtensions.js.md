# markExtensions.js

Source: [`src/lib/markExtensions.js`](../../../src/lib/markExtensions.js)

Safe writing of the Markdown marks (bold, italic, strikethrough…).

Tiptap's serialiser writes marks with fixed delimiters, and a space inside the mark next to the closing delimiter (`***test. ***`) does not close it according to CommonMark: on reopening, the document showed real asterisks in the text, and every save kept the damage. This happens often in documents converted from Word, where the space before a line break carries the same bold as the text.

- `SafeMarks`: wraps the editor's Markdown serialiser (once) and, before writing, normalises the inline content: every text is split into leading spaces, core and trailing spaces; the edge spaces keep only the marks that their outer neighbour also has; adjacent texts with the same marks are merged again. So the space between two bold words stays bold, while the one at the end of the run (or before a line break) does not.
- `MarkdownItalic`: italic with the delimiter chosen at write time (`delimiter` attribute, for the serialiser only: it goes neither into the document nor into the HTML). A run of italic that only partly covers bold (`***a**.**"***`) uses `_`, which always reads back; otherwise it stays `*`, as before.

`SafeMarks` must come after the Markdown extension, which creates `editor.markdown` in `onBeforeCreate`.
