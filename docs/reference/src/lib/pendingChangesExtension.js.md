# pendingChangesExtension.js

Source: [`src/lib/pendingChangesExtension.js`](../../../../src/lib/pendingChangesExtension.js)

The assistant's edits "on hold". A direct edit stays applied to the document, but each one is marked as to be reviewed: the new text is highlighted and above it the previous version is shown with Accept and Reject buttons. Accepting keeps it; rejecting puts back the earlier text.

Plugin state: `{ changes: [{ id, from, to, old }] }`, where `from`–`to` is the range in the current document and `old` the content (a ProseMirror `Fragment`) that was there before the first assistant edit on that range.

- `trackEdit(editor, edit)`: runs one or more assistant edits and marks what changed, returning `false` if the document did not change. Changed and unchanged blocks are aligned with a top-level block diff (LCS, falling back to one whole range when the comparison matrix would be too large); edits overlapping a range already on hold merge into a single change and keep the oldest original text. The state is set with `addToHistory: false`.
- `acceptAll(editor)` and `rejectAll(editor)`: accept or undo every pending change (rejecting rewrites the ranges from the bottom up).
- `serializePending(editor)` and `restorePending(editor, data)`: carry the pending changes through a restart or a project switch. They are saved by top-level block index rather than by position, with the previous text as JSON, and are restored only when the document read back is the same one (same number of blocks and same amount of text): otherwise the positions would not coincide and a wrong review would be shown.
- `getPending(state)`: the pending changes. `pendingKey`: the plugin key.

After an undo (or a manual correction) a range that has become identical to the original stops being a change.

The review is fine-grained, on words: the old and new text blocks (paragraphs, headings, list items, cells…) are paired by similarity with [inlineDiff.js](inlineDiff.js.md), and only what really changed is shown — the new words highlighted (`ow-pending-added`), the removed ones struck through in the "before" block (`ow-pending-removed`), untouched paragraphs dimmed, deleted ones struck through entirely. A change of structure only (for instance from a bulleted to a numbered list) falls back to showing the whole previous block. The widget (`ow-pending-widget`) carries the caption and the two buttons, whose labels come from the extension options; it is cached by the signature of the change so that it is not rebuilt while typing elsewhere.
When the edit is light (every changed block is paired, only text changed, and less than half of the combined old and new text differs) the review is inline: the "before" block is left out and each removed run is shown struck through (`ow-pending-removed-inline`, a widget decoration) right where it was, next to the highlighted new words, as in the notes panel. Whole replacements, new or removed blocks and format-only changes keep the two-block view. `diffText` returns, for each removed range, the offset in the new text where it sat.