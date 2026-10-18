# inlineDiff.js

Source: [`src/lib/inlineDiff.js`](../../../src/lib/inlineDiff.js)

Word-level differences between two texts, used to show only what actually changed inside an assistant edit awaiting review, instead of the whole replaced paragraph.

- `tokenize(text)`: the text as tokens (words, punctuation, spaces), each with its `start`/`end` offsets.
- `similarity(before, after)`: a 0–1 similarity between two texts (words in common, order ignored), used to decide which old and new blocks correspond.
- `diffText(before, after)`: the changed character ranges in each text, `{ removed, added }`. Equal prefixes and suffixes are skipped, the middle is compared with an LCS; above 1.5 million cells the whole middle is marked as changed. A space between two changed words counts as changed, so "two words" becomes a single range; spaces at the edges do not.
- `alignBlocks(oldBlocks, newBlocks, threshold)`: for each new block `{ text, type }`, the index of the matching old one or -1. Blocks correspond when they have the same type and are similar enough (0.35 by default); the pairing keeps the order and maximises the total similarity. Above 40,000 pairs the blocks are paired by position only, if there are as many.

Ranges are returned as `[from, to)` intervals on the original text.
