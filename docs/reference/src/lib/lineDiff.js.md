# lineDiff.js

Source: [`src/lib/lineDiff.js`](../../../src/lib/lineDiff.js)

Line-based diff used by the version diff dialog.

- `lineDiff(before, after)` returns a sequence of `{ type: 'same' | 'add' | 'del', text }` lines: common head/tail are trimmed first, then the middle is diffed through an LCS matrix (`Uint32Array`) with a safety cap of 4,000,000 cells — beyond that, the whole middle is shown as a plain replacement.
- `collapseDiff(lines, context = 3)` collapses long unchanged stretches into single `{ type: 'gap' }` placeholders ("{hidden} unchanged lines"), keeping `context` lines around every change.

