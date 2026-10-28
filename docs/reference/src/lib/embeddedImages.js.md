# embeddedImages.js

Source: [`src/lib/embeddedImages.js`](../../../../src/lib/embeddedImages.js)

Images embedded in Markdown as base64 `data:` URIs are hugely long lines that are of no use to someone reading the text. In the source view and in the assistant's context they are shown abbreviated, while the document keeps them whole.

- `collapseEmbeddedImages(text)`: replaces every base64 payload of 1,500 characters or more with a numbered placeholder (`⟦image data, 12 KB #1⟧`) and returns `{ text, blobs }`, the payloads needed to put them back.
- `expandEmbeddedImages(text, blobs)`: restores the original data in place of the placeholders; an unknown placeholder (or one edited by hand) stays as it is.
- `abbreviateEmbeddedImages(text)`: replaces each payload with `[12 KB of image data omitted]`, for the assistant, whose context the data would only fill up.

The size is shown in KB or, above a megabyte, in MB.