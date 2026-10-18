# mathExtensions.js

Source: [`src/lib/mathExtensions.js`](../../../src/lib/mathExtensions.js)

LaTeX formulas of extended Markdown: `$…$` in the text and `$$…$$` (also on several lines) as a block. They are not rendered: they stay raw text, written back identical on save. Without these extensions the `_` and `*` of a formula were read as italic and written as `\_`, changing the formula.

- `MathInline`: `$…$` in the text, an indivisible atom (`span[data-math-inline]`, class `ow-math`) keeping the source in the `source` attribute. The opening `$` must be followed by a non-space and the closing one preceded by a non-space and not followed by a digit, so that "it costs $5 and $10" is not a formula.
- `MathBlock`: `$$` on one line (`$$ x $$`) or `$$`, the formula and `$$` on several lines, kept as a raw block (`pre[data-math-block]`, classes `ow-raw-block ow-math-block`).

Both define their own Markdown tokenizer and renderer, so the formula comes back exactly as it was written.
