# TabBar.jsx

Source: [`src/components/TabBar.jsx`](../../../../../src/components/TabBar.jsx)

Horizontal tab strip for documents, browser tabs and image tabs, with `role="tablist"` semantics.

- Each tab shows an icon by `tab.kind` (document, globe, picture), the title (tooltip with the file path, the source path, the image path, or the title), a pin button (documents only), a close button, activation on click, and close on middle-click; the active tab is marked by an accent top border, a closed document is shown in italics and dimmed.
- The dirty indicator is the close button itself: an accent dot that turns into the cross on hover.
- A preview tab is italic and a double click keeps it (`onPromote`): opening another file replaces it until the user works on it.
- A pinned tab is narrower; tabs can be dragged to reorder them, with an accent outline on the drop target.
- The tabs scroll sideways with the wheel, without a visible scrollbar (which would leave an empty band under the fixed buttons), and a thin indicator at the bottom shows the position; the active tab is always brought into view.
- The context menu of a tab offers Pin/Unpin (documents only) and Close.
- Buttons outside the scrolling area, so they stay within reach with many tabs open: new browser tab and new document on the left; on the right "Save all" — active only with more than one modified document, with a badge counting them — and the sticky toggle for the AI assistant, showing its pressed state.
- Close confirmation for dirty documents is handled by App through the `onClose` callback.

