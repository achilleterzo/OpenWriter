# electron/markdown-embed.cjs

Source: [`electron/markdown-embed.cjs`](../../electron/markdown-embed.cjs)

Self-contained Markdown export: the images of a document — files next to it, in the project, or elsewhere on disk — are embedded in the text as `data:` URIs, so the `.md` file can be shared on its own, without the `images/` folder and without a zip.

`embedImages(markdown, documentPath)` replaces the source of every local image and leaves untouched the images already embedded (`data:`) and the remote ones (`http`/`https`). The images are found through the Markdown tokens ([markdown-images.cjs](markdown-images.cjs.md)), not with a regular expression: an example inside a code block or between backticks is not touched, and destinations with parentheses (`images/photo(1).png`), escapes or angle brackets are read whole. The rest of the document stays identical, line endings included. Relative paths are resolved against the document folder; `file:` URLs are converted. Limits: 8 MB per image and 60 MB in total.

It returns `{ markdown, embedded, missing, tooLarge, remote }`: the counts and the sources that could not be embedded, which the caller can report to the user. The same image used several times is read once.
