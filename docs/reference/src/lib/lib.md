# src/lib

Non-React helpers used by the editor and the assistant.

- [aiOptions.js](aiOptions.js.md) — AI option types and defaults shared between components
- [aiTools.js](aiTools.js.md) — Tool catalog and executor of the assistant tools on the renderer side
- [anchoring.js](anchoring.js.md) — Note anchoring: unique text location from quote, prefix, and suffix
- [annotationExtension.js](annotationExtension.js.md) — Tiptap decoration extension rendering find highlights and note markers
- [chatAttachments.js](chatAttachments.js.md) — Chat attachments (images, PDF) and token usage formatting
- [editorInsert.js](editorInsert.js.md) — Inserts a Markdown text into the editor in place of a range, keeping formatting
- [imageExtension.js](imageExtension.js.md) — Tiptap image node used by the editor
- [imagePaths.js](imagePaths.js.md) — Resolution of document-relative image paths to the ow-file protocol
- [keepSelectionExtension.js](keepSelectionExtension.js.md) — Tiptap extension keeping the selection visible when the editor loses focus
- [layout.js](layout.js.md) — Panel layout: widths, clamping, persistence, and fitting on resize
- [lineDiff.js](lineDiff.js.md) — Line-level diff used by the version diff dialog
- [pendingChangesExtension.js](pendingChangesExtension.js.md) — Assistant edits marked for review, with accept and reject
- [projectIcons.js](projectIcons.js.md) — Project icons: reading, caching, choosing, resizing
- [quickActions.js](quickActions.js.md) — Chat quick actions: defaults, custom ones, and what to save
- [rawMarkdownExtensions.js](rawMarkdownExtensions.js.md) — Front matter and HTML kept as raw text through the round trip
- [readerMode.js](readerMode.js.md) — Article extraction, reading view, and save as Markdown
- [searchExtension.js](searchExtension.js.md) — Tiptap extension powering live find highlight and match counting
- [skills.js](skills.js.md) — Writing skills: serialization, active skills, system-prompt block, AI generation prompts

