# annotationExtension.js

Source: [`src/lib/annotationExtension.js`](../../../../src/lib/annotationExtension.js)

Tiptap extension (`Annotations`, plugin key `owAnnotations`) that renders anchored notes over the document as decorations, without modifying its text.

- Builds inline decorations for every open note located through `locateQuote` (classes `ow-note`, `ow-note-comment` / `ow-note-suggestion`, plus `ow-note-active` for the selected note, with the note body as tooltip).
- The decoration set is rebuilt on relevant transactions or on a `notes`/`activeId` meta update; stale notes (text no longer found) are skipped.
- Clicking a decorated range reports its `data-note-id` through the `onSelect` option.
- `setAnnotations(editor, notes, activeId)` refreshes the notes shown in one editor (only open notes are highlighted); exported for App and NotesPanel alongside the `annotationKey` plugin key.

