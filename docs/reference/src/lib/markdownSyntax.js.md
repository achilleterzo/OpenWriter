# markdownSyntax.js

Source: [`src/lib/markdownSyntax.js`](../../../src/lib/markdownSyntax.js)

The Markdown syntax of links and images, written correctly: destination, text (`alt`) and title. Wrapping the destination in `<…>` is not enough: inside, `\`, `<` and `>` must be protected, a text with `[` or `]` and a title with `"` would break the line (or change its meaning) if written as they are. Used by [imageExtension.js](imageExtension.js.md) and by the link of the editor (`DocumentLink`, in [DocumentPane.jsx](../components/pages/DocumentPane.jsx.md)). The same rule for destinations lives in [markdown-images.cjs](../../electron/markdown-images.cjs.md): they have to stay aligned.

- `markdownDestination(value)`: plain if it has nothing special (no spaces, `<`, `>`, `\`, unbalanced parentheses: `images/photo(1).png` stays plain), otherwise inside `<…>` with `\`, `<` and `>` escaped.
- `markdownLinkText(value)`: link text or `alt` with `[`, `]` and `\` escaped, no line breaks.
- `markdownTitle(value)`: the title in double quotes with `"` and `\` escaped; empty when there is no title.
- `markdownTarget(destination, title)`: `destination "title"`, to put between the parentheses.

Writing and reading again a document with such links and images gives the same attributes and the same text.
