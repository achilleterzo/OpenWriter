
# textSearch.js

Source: [`src/lib/textSearch.js`](../../../../src/lib/textSearch.js)

Search and replace in a plain text (the text reader), as pure functions on strings and positions.

- `findMatches(text, { query, caseSensitive, wholeWord, regex })` → `{ matches: [{ from, to, groups }], error, truncated }`. Whole word counts letters, digits, `_` and the accented Latin letters as word characters. `^` and `$` work per line. An empty match (such as `a*`) is skipped, an invalid expression returns its message, and at most `MAX_MATCHES` (5000) are collected (`truncated`).
- `replaceOne(text, match, replacement)` → `{ text, caret }` and `replaceAll(text, matches, replacement)` → `{ text, count }`. With a regular expression the replacement expands `$1`…`$99`, `$&`, `` $` ``, `$'`, `$<name>`, `$$`; otherwise it is inserted as it is.
- `lineStarts(text)` and `lineOf(starts, position)`: where each line begins and the line of a position (used to place the highlights and to bring a match into view).

Tested in `tests/text-search.test.cjs`.
