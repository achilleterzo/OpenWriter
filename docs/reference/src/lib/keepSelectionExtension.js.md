---
# keepSelectionExtension.js

Source: [`src/lib/keepSelectionExtension.js`](../../../src/lib/keepSelectionExtension.js)

Tiptap extension (`KeepSelection`) that keeps the selection visible when the editor loses focus, for instance while writing a note or using the toolbar or the chat. Without it the browser selection disappears, even though it is still in the editor state.

A plugin state is set to `true` on `blur` and back to `false` on `focus`; while it is `true` the selection is drawn as an inline decoration with the `ow-selection-kept` class. No decoration is drawn for an empty selection.

