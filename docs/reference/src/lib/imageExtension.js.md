# imageExtension.js

Source: [`src/lib/imageExtension.js`](../../../src/lib/imageExtension.js)

Tiptap image node configuration (`DocumentImage`, extending `@tiptap/extension-image`). The document keeps the `src` exactly as written in the Markdown (relative path or `file:///` address); `addOptions` extends the parent options with a `resolveSource(src)` hook which the HTML rendering uses to replace the stored `src` with the loadable address (an `ow-file://` URL produced by [imagePaths.js](imagePaths.js.md)).

- `markdownDestination(value)`: the destination as it must be written in Markdown — wrapped in `<…>` when it contains spaces or angle brackets, since otherwise the link would break.
- `href` and `linkTitle` attributes: an image inside a link, `[![alt](img.png)](https://…)`, keeps the link as an attribute of the image (a block image cannot carry the `link` mark). `renderMarkdown` writes the image back as `![alt](src "title")` and, when there is a link, wraps it in `[…](href "linkTitle")`.

Destinations, alternative text and titles are written with [markdownSyntax.js](markdownSyntax.js.md): `[`, `]`, `\`, `<`, `>` and the quotation marks are protected, so that an image or a link written and read again keeps the same attributes. (`markdownDestination` now lives there.)
