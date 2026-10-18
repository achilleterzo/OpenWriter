# imagePaths.js

Source: [`src/lib/imagePaths.js`](../../../src/lib/imagePaths.js)

Image path handling for Markdown documents (Windows-separator tolerant, case-insensitive for drive paths).

- Storage rule: images inside the project or next to the document are written as document-relative paths; anything else is written as an absolute `file:///` address. `sourceForImage(imagePath, documentPath, project)` produces that text, computing the relative path and URL-encoding it.
- `displaySource(src, documentPath)`: turns a stored `src` into the address to load in the editor — `https:`, `data:image/`, and already-`ow-file:` values pass through; relative values resolve against the document folder (empty when the document was never saved); `file:///` values are decoded (drive-letter prefix tolerated). Both shapes become `ow-file://local/<encoded-absolute>` served read-only by the main process.
- `resolveDocumentLink(href, documentPath)`: classifies document links for Ctrl+click — `external` (http(s)), `file` (local path, relative to the document, absolute, or `file:///`; query stripped, with `fragment` kept separately as the bookmark or heading name), `anchor` (`#name`, possibly empty), or `unresolved` (relative links in never-saved documents, or unhandled schemes).
- `isImageFile(filePath)`: whether the application can show a file (png, jpg, gif, webp, bmp); `imageFileUrl(absolutePath)`: the `ow-file://` address used to display it, also for the image tab.
- Helpers: `dirname`, `isInside`, plus internal `relativePath`/`joinPath` (`..`-aware) and a decode that never throws.

Paths are compared with [pathCompare.js](pathCompare.js.md): case matters on Linux, not on Windows and macOS.
