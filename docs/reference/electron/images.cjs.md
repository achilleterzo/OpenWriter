# electron/images.cjs

Source: [`electron/images.cjs`](../../electron/images.cjs)

Image helper for the assistant conversations: downloads an image from an http(s) URL, validates its MIME type and size, and returns it to the renderer; exposes read access to project images through the project tools, and captures screenshots of the app window, the active document, or browser webview tabs, returning them as image payloads for vision-capable models.