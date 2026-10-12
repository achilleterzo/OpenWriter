# OutlinePanel.jsx

Source: [`src/components/OutlinePanel.jsx`](../../../../../src/components/OutlinePanel.jsx)

Heading outline of the active document. Collects the current headings (H1–H7 with text and position) through `useEditorState` (re-rendering only when the heading list changes), indents each entry by its level, scrolls the editor to the selected heading, and shows placeholders when no document is open or no heading exists.