# listItemExtension.js

Source: [`src/lib/listItemExtension.js`](../../../src/lib/listItemExtension.js)

A list item that, when writing Markdown, indents its nested content by the width of its own marker (`- ` = 2, `1. ` = 3, `10. ` = 4). Tiptap's default always indents by two spaces: under `1. ` the sub-list was no longer nested for CommonMark (which needs at least the width of the marker), and other programs (GitHub…) showed it as a separate list.

`MarkdownListItem` extends Tiptap's `ListItem`: `renderMarkdown` computes the prefix (`- ` for a bullet list, `<number>. ` for an ordered one, following the list start), indents every following line by that many spaces, and separates a paragraph after the first with an empty line while a nested list follows immediately.
