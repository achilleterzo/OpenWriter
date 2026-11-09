# SourceEditor.jsx

Source: [`src/components/SourceEditor.jsx`](../../../../../src/components/SourceEditor.jsx)

The Markdown source view: a text area with the line numbers on the left. The text wraps as in the editor, and each number is aligned with the first visual line of its line, because the number column holds an invisible copy of the text that wraps the same way (a `memo` component recomputes it only when the text changes). The whole view scrolls together in a single container.

The base64 data of embedded images (megabytes on a single line) would block the layout twice, in the field and in the number column: [embeddedImages.js](../../lib/embeddedImages.js.md) replaces them with numbered placeholders for display, and they go back whole into the document on every change.

**Also the text reader.** The field is shared with [TextPane.jsx](TextPane.jsx.md) through props: `lineNumbers` (off hides the column and the separator line), `plain` (plain text: no treatment of embedded images), `marks` (`[{ from, to, current }]`: positions in the text, drawn as highlights behind the field) and `reveal` (`{ position, nonce }`: scrolls that position into view), plus `readOnly`. The highlights live in the invisible mirror copy of the text: the text there is transparent, and the background of the `mark` shows through the transparent `textarea`. Each line is a memoized component, so typing re-renders only the lines that changed.
