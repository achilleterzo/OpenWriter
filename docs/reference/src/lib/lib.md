# src/lib

Non-React helpers used by the editor and the assistant.

- [aiOptions.js](aiOptions.js.md) — AI option types and defaults shared between components
- [aiTools.js](aiTools.js.md) — Tool catalog and executor of the assistant tools on the renderer side
- [alertExtension.js](alertExtension.js.md) — GitHub alerts (`[!NOTE]`…) in blockquotes
- [anchoring.js](anchoring.js.md) — Note anchoring: unique text location from quote, prefix, and suffix
- [annotationExtension.js](annotationExtension.js.md) — Tiptap decoration extension rendering find highlights and note markers
- [bookmarkExtension.js](bookmarkExtension.js.md) — Bookmarks drawn in the text as decorations
- [bookmarkLinks.js](bookmarkLinks.js.md) — Links to bookmarks and headings (`file.md#name`)
- [chatAttachments.js](chatAttachments.js.md) — Chat attachments (images, PDF) and token usage formatting
- [documentStats.js](documentStats.js.md) — Word, sentence and reading-time statistics of a document
- [editorInsert.js](editorInsert.js.md) — Inserts a Markdown text into the editor in place of a range, keeping formatting
- [embeddedImages.js](embeddedImages.js.md) — Embedded base64 images collapsed for display and for the assistant
- [fonts.js](fonts.js.md) — Editor fonts: bundled families and the Google Fonts catalog
- [footnoteExtensions.js](footnoteExtensions.js.md) — Footnote references and definitions kept as written
- [imageExtension.js](imageExtension.js.md) — Tiptap image node, also inside a link
- [imagePaths.js](imagePaths.js.md) — Document-relative image paths, link resolution, image tabs
- [inlineDiff.js](inlineDiff.js.md) — Word-level differences for the review of assistant edits
- [keepSelectionExtension.js](keepSelectionExtension.js.md) — Tiptap extension keeping the selection visible when the editor loses focus
- [layout.js](layout.js.md) — Panel layout: widths, clamping, persistence, and fitting on resize
- [lineDiff.js](lineDiff.js.md) — Line-level diff used by the version diff dialog
- [listItemExtension.js](listItemExtension.js.md) — List items indented by the width of their own marker
- [markdownSyntax.js](markdownSyntax.js.md) — Destination, text and title of links and images, written correctly
- [markExtensions.js](markExtensions.js.md) — Safe writing of the Markdown marks and italic delimiters
- [mathExtensions.js](mathExtensions.js.md) — LaTeX formulas (`$…$`, `$$…$$`) kept as written
- [mcpRequests.js](mcpRequests.js.md) — Agent requests applied to the open editor, and to the workspace (opening a document or a project, a task for the assistant)
- [pathCompare.js](pathCompare.js.md) — Platform-aware path comparison in the interface
- [pendingChangesExtension.js](pendingChangesExtension.js.md) — Assistant edits marked for review, with accept and reject
- [preferences.js](preferences.js.md) — Interface preferences stored in the application data
- [projectIcons.js](projectIcons.js.md) — Project icons: reading, caching, choosing, resizing
- [quickActions.js](quickActions.js.md) — Chat quick actions: defaults, custom ones, and what to save
- [rawMarkdownExtensions.js](rawMarkdownExtensions.js.md) — Front matter and HTML kept as raw text through the round trip
- [readerMode.js](readerMode.js.md) — Article extraction, reading view, and save as Markdown
- [searchExtension.js](searchExtension.js.md) — Tiptap extension powering live find highlight and match counting
- [skills.js](skills.js.md) — Writing skills: serialization, active skills, system-prompt block, AI generation prompts
- [smartDashesExtension.js](smartDashesExtension.js.md) — Dashes and ellipsis typed in the editor
- [textAlignExtension.js](textAlignExtension.js.md) — Text alignment saved as aligned HTML blocks
- [updateSchedule.js](updateSchedule.js.md) — When the application checks for a new version

