---
# pendingChangesExtension.js

Source: [`src/lib/pendingChangesExtension.js`](../../../src/lib/pendingChangesExtension.js)

The assistant's edits "on hold". A direct edit stays applied to the document, but each one is marked as to be reviewed: the new block is highlighted and above it the previous (struck-through) text is shown with Accept and Reject buttons. Accepting keeps it; rejecting puts back the earlier text. The unit is the top-level block (paragraphs, headings, lists…).

Plugin state: `{ changes: [{ id, from, to, old }] }`, where `from`–`to` is the range of blocks in the current document and `old` the content (a ProseMirror `Fragment`) that was there before the first assistant edit on that range.

- `trackEdit(editor, edit)`: runs one or more assistant edits and marks what changed, returning `false` if the document did not change. Changed and unchanged blocks are aligned with a block-level diff (LCS, falling back to one whole range when the comparison matrix would be too large); edits overlapping a range already on hold merge into a single change and keep the oldest original text; later edits on the same point behave the same way. The plugin state is set with `addToHistory: false`.
- `acceptAll(editor)` and `rejectAll(editor)`: accept or undo every pending change (rejecting rewrites the ranges from the bottom up).
- `getPending(state)`: the pending changes.
- `pendingKey`: the plugin key.

After an undo (or a manual correction) a range that has become identical to the original stops being a change. Widgets and highlight are rendered as decorations: the `ow-pending-widget` with the caption and the buttons (whose labels come from the extension options) and the `ow-pending-new` class on the changed blocks.

