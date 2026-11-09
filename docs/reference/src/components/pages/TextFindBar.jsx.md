
# TextFindBar.jsx

Source: [`src/components/TextFindBar.jsx`](../../../../../src/components/TextFindBar.jsx)

Find and replace of the text reader. It shows the bar of [FindPanel.jsx](FindPanel.jsx.md) and searches the text with [textSearch.js](../../lib/textSearch.js.md): the matches (`onMarks`) are highlighted behind the field of [SourceEditor.jsx](SourceEditor.jsx.md), the current one is revealed (`onReveal`), and a replacement calls `onText` with the new text. A new search starts from the first match; the status shows "n of total" (with "+" when the 5000 matches limit was reached); an invalid expression is marked in red.
