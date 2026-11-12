# electron/markdown-extract.cjs

Source: [`electron/markdown-extract.cjs`](../../../electron/markdown-extract.cjs)

The reverse of [markdown-embed.cjs](markdown-embed.cjs.md): the images embedded in the text (`data:image/…;base64,…`) become files in a folder beside the document, and the Markdown links them with a relative path. It works line by line — a consolidated document can be tens of megabytes — without building a tree of the document, and it understands the reference definitions of a consolidated file (`[key]: data:…`), inline images and `<img>` tags. The examples inside code fences are left alone.

- `extractImages(markdown, { directory, link = 'images', stem = 'image' })`: returns `{ markdown, count, bytes }`, the rewritten Markdown, how many images were written and their total size. `directory` is where the files go (the caller passes `images` beside the document), `link` the prefix of the relative path left in the Markdown, `stem` the base name for the files that have no label.
- Patterns: `TYPES` is `png|jpe?g|gif|webp|bmp`; `DEFINITION` matches a reference definition, `INLINE` a `](data:…` image, `HTML` an `<img src="data:…">`. The same content is never written twice: a map from the base64 text to the file name is kept for the current call.
- Names: the label of a definition is reduced to letters, digits, dot, dash and underscore (`safe`); without a label the name is `stem-<sha1:8>`. A file that already exists is reused only if its bytes are identical; otherwise a free name is tried (`-<hash>`, then `-<hash>-<n>`), and the file is written with the `wx` flag, so another image is never overwritten. The extension is the image type (`jpeg` becomes `jpg`).
- A fence is tracked with `FENCE` (three or more backticks or tildes), so text inside code blocks is returned unchanged even when it contains a `data:image/` string.
- Used by [main.cjs](main.cjs.md) for the "extract the images of a Markdown file" command: it writes the new Markdown over the file and reports the count and the bytes, with the renderer told when the work starts (`document:extract-markdown-images-start`, with the name and the size in MB).
