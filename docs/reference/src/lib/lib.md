# src/lib

Non-React helpers used by the editor and the assistant.

| Module | Role |
| --- | --- |
| [aiOptions.js](aiOptions.js.md) | AI option types and defaults shared between components |
| [aiTools.js](aiTools.js.md) | Tool catalog and executor of the assistant tools on the renderer side |
| [anchoring.js](anchoring.js.md) | Note anchoring: unique text location from quote, prefix, and suffix |
| [annotationExtension.js](annotationExtension.js.md) | Tiptap decoration extension rendering find highlights and note markers |
| [imageExtension.js](imageExtension.js.md) | Tiptap image node used by the editor |
| [imagePaths.js](imagePaths.js.md) | Resolution of document-relative image paths to the ow-file protocol |
| [layout.js](layout.js.md) | Panel layout: widths, clamping, persistence, and fitting on resize |
| [lineDiff.js](lineDiff.js.md) | Line-level diff used by the version diff dialog |
| [searchExtension.js](searchExtension.js.md) | Tiptap extension powering live find highlight and match counting |