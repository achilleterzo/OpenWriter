# TabBar.jsx

Source: [`src/components/TabBar.jsx`](../../../../../src/components/TabBar.jsx)

Horizontal tab strip for documents and browser tabs, with `role="tablist"` semantics.

- Each tab shows a document or globe icon (by `tab.kind`), the title (tooltip with the file path, or the source path, or the title), a pin button (documents only), a close button, activation on click, and close on middle-click; the active tab is marked by an accent top border, and a closed document is shown in italics and dimmed.
- The dirty indicator is the close button itself: an accent dot that turns into the cross on hover.
- A pinned tab is narrower; tabs can be dragged to reorder them, with an accent outline on the drop target.
- The context menu of a tab offers Pin/Unpin (documents only) and Close.
- Trailing buttons: new document, new browser tab, and a sticky right-aligned toggle for the AI assistant showing its pressed state.
- Close confirmation for dirty documents is handled by App through the `onClose` callback.

