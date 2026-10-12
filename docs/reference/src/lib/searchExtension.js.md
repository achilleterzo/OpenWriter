# searchExtension.js

Source: [`src/lib/searchExtension.js`](../../../src/lib/searchExtension.js)

Tiptap extension for find and replace: computes all matches for the current query (plain text, case-sensitive, whole word, or regular expression), exposes match counts and live decorations through the annotation extension, and supports replace-current and replace-all as a single undoable transaction with `$1` group substitution.