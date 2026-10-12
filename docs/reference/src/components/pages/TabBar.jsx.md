# TabBar.jsx

Source: [`src/components/TabBar.jsx`](../../../../../src/components/TabBar.jsx)

Horizontal tab strip for documents and browser tabs, with `role="tablist"` semantics.

- Each tab shows a document or globe icon (by `tab.kind`), the title (tooltip with the file path), a dirty indicator (accent dot that becomes a close button on hover), activation on click, and close on middle-click; the active tab is marked by an accent top border.
- Trailing buttons: new document, new browser tab, and a sticky right-aligned toggle for the AI assistant showing its pressed state.
- Close confirmation for dirty documents is handled by App through the `onClose` callback.

