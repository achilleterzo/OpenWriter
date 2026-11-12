# AnchorsPanel.jsx

Source: [`src/components/AnchorsPanel.jsx`](../../../../../src/components/AnchorsPanel.jsx)

Side panel listing the HTML anchors of the document — the `<a id="name"></a>` written in the text, which in the editor appear as an icon — in the order they occur. Each row shows the id (in monospace, truncated) and, next to it, the text the anchor refers to, truncated as well; hovering shows a tooltip with `#id — text`. Clicking a row jumps to it: the editor takes the focus, the anchor position becomes the node selection and the view scrolls there, after calling `onJump` (so the panel can close the side panel).

- Props: `editor` (the Tiptap editor) and `onJump` (optional callback, called before jumping). Without an editor the panel shows "No document open".
- With no anchors the panel shows "No anchors in the document".
- The list comes from `collectAnchors` ([rawMarkdownExtensions.js](../../lib/rawMarkdownExtensions.js.md)), recomputed only when the document changes (the serialised result is cached against the document instance), so typing in the editor does not re-collect the anchors at every keystroke.
- Each entry carries `id`, `text` and `pos`, the position used for the jump.
