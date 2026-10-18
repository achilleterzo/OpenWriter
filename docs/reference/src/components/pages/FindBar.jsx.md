# FindBar.jsx

Source: [`src/components/FindBar.jsx`](../../../../../src/components/FindBar.jsx)

Find and replace bar, drawn over the document in the top right corner (it fits inside the pane on narrow windows). It works on the editor state through [searchExtension.js](../../lib/searchExtension.js.md), which keeps the matches and the current one.

- Opening it takes the query from the text selected in the editor, when the selection is on a single line, and puts the cursor on the field; every later request focuses the field again.
- The arrow on the left folds the replace row in and out (the shortcut `Ctrl+H` opens the bar already in replace mode).
- Options with a pressed state: match case (`Aa`), whole word (`ab`), regular expression (`.*`, with `$1` capture groups in the replacement). An invalid expression is marked on the field and reported as "Invalid expression".
- Between the two rows, the status: the position of the current match ("2 of 7") or "No results", with the buttons for the previous match (Shift+Enter), the next one (Enter), and closing (Escape).
- In replace mode: the replacement field, "Replace" for the current match (Enter, then it moves to the next one) and "All", which replaces every match as a single undoable operation.

Closing the bar clears the query, so the highlights disappear.