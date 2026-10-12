# anchoring.js

Source: [`src/lib/anchoring.js`](../../../src/lib/anchoring.js)

Text anchoring for notes: instead of remembering a position, a note keeps the quoted text plus a bit of surrounding context, so it survives document changes and keeps the Markdown clean.

- `buildTextIndex(doc)`: plain text of the document (blocks separated by newlines) with the map to ProseMirror positions.
- `findAll(text, quote)`: occurrences of the quote — exact matches first, then falling back to token-based matching that tolerates differing whitespace and line breaks.
- `toRange(index, hit)`: converts a text hit to an editor range; `anchorContext(index, hit)` extracts 40 characters of `prefix`/`suffix` to store with the note.
- `locateQuote(doc, note, index)`: locates the note in the text, using the stored context to pick the right occurrence when the quote appears multiple times; returns `{ from, to, count }` or `null` when the text is gone.

