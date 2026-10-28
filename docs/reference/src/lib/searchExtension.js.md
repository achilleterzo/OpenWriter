# searchExtension.js

Source: [`src/lib/searchExtension.js`](../../../../src/lib/searchExtension.js)

Tiptap extension (`Search`, plugin key `owSearch`) powering find and replace: matches are rendered as decorations (`ow-find`, `ow-find-current`) without touching the text.

- `buildMatchers(params)`: compiles the query — plain text (escaped) or regular expression, `caseSensitive`, `wholeWord` (Unicode-aware word boundaries, unlike ASCII `\b`), global and single-use variants; invalid patterns return an error message instead of throwing.
- `findMatches` scans the plain-text index, skipping empty and multi-block matches, capped at `MAX_MATCHES` 5000.
- State and navigation: `setSearch` sets or clears the query and selects the nearest match from the cursor; `goToMatch(editor, delta)` cycles through matches (wrapping around) and scrolls into view.
- `replaceCurrent(editor, replacement)`: replaces the current match (with `$1`-style capture-group substitution in regex mode) and advances to the next one.
- `replaceAll(editor, replacement)`: every replacement applied back-to-front in a single transaction, so it is one undoable (`Ctrl+Z`) operation; returns the number of replacements.
- Exports also `getSearchState`, `searchKey`, and `emptyParams`.

