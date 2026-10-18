# electron/markdown-images.cjs

Source: [`electron/markdown-images.cjs`](../../electron/markdown-images.cjs)

The images of a Markdown document, found by the Markdown tokens ([markdown-tokens.cjs](markdown-tokens.cjs.md)) and not by regular expressions: examples inside a code block or between backticks are left out, and destinations with balanced parentheses (`images/photo(1).png`), escapes or `<…>` are read whole. Used by the move of a document ([document-images.cjs](document-images.cjs.md): which images follow it and who still uses them), by the export with embedded images ([markdown-embed.cjs](markdown-embed.cjs.md)) and by the save that turns `data:` URIs into files (`externalizeImages` in [main.cjs](main.cjs.md)).

- `findImages(markdown)`: every image, in order, as `{ href, alt, title, raw, start, end, destination }`. `destination` (`{ from, to, value }` in the normalised source) exists when the image could be placed in the source; otherwise it is `null` (for instance an image in a multi-line quotation, or a reference-style `![alt][ref]`): whoever rewrites the text skips it, whoever looks for references still counts it.
- `rewriteImageDestinations(markdown, change)`: rewrites the destinations; `change(image)` returns the new one or `null` to leave it. The rest of the document stays identical, CRLF line endings included.
- `formatDestination(value)`: the destination as it has to be written: plain when it has nothing special (no spaces, `<`, `>`, `\` and balanced parentheses), otherwise inside `<…>` with `\`, `<` and `>` escaped. Same rule as [markdownSyntax.js](../src/lib/markdownSyntax.js.md) in the interface.
