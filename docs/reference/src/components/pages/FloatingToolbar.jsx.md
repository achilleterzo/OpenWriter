# FloatingToolbar.jsx

Source: [`src/components/FloatingToolbar.jsx`](../../../../../src/components/FloatingToolbar.jsx)

A floating bar attached to the editor selection (or to the cursor): it sits above the selected text and moves below it when there is no room. It is generic — the content is decided by whoever uses it (links, quick formatting…), which also says when to show it with `open`.

`containerRef` is the `relative` element holding the editor and its scrolling (`[data-document-scroll]`): the bar is positioned inside it and hides when the text scrolls out of view. The position is recomputed on every selection change, transaction, scroll and window resize, and is kept inside the pane edges with a small margin. A click on a button does not take the focus away from the editor (text fields inside the bar do, and the selection is kept by the editor anyway).

The module also exports two building blocks: `FloatingDivider`, a vertical separator, and `FloatingButton`, an icon button with a label, an active state for the marks applied to the selection, and a danger variant.
