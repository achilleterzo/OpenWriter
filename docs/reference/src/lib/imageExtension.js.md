# imageExtension.js

Source: [`src/lib/imageExtension.js`](../../../src/lib/imageExtension.js)

Tiptap image node configuration (`DocumentImage`, extending `@tiptap/extension-image`). The document keeps the `src` exactly as written in the Markdown (relative path or `file:///` address); `addOptions` extends the parent options with a `resolveSource(src)` hook which the HTML rendering uses to replace the stored `src` with the loadable address (an `ow-file://` URL produced by `imagePaths.js`).