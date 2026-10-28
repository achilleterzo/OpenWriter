# electron/markdown-plain.cjs

Source: [`electron/markdown-plain.cjs`](../../../electron/markdown-plain.cjs)

The plain text of a Markdown document as the OpenWriter editor sees it: blocks separated by `\n`, without the Markdown symbols (no asterisks, list markers, `#`, links reduced to their text). Notes are anchored to this text (see [anchoring.js](../../src/lib/anchoring.js.md)), so a quotation given as plain text is found again in the editor — and so are the quotations of the MCP notes, replacements and insertions.

The text follows the editor's semantics, not those of a plain Markdown converter, and the recognition goes through [markdown-tokens.cjs](markdown-tokens.cjs.md), which uses the editor's own rules:

- footnote references (`[^1]`) and inline formulas (`$…$`) are elements without text: they do not appear. Inside a code block or between backticks `[^1]` stays text;
- block formulas (`$$…$$`), footnote definitions, HTML blocks and the front matter are raw text blocks and appear as written. The front matter counts only at the start of the document and only if it passes the same check as the editor's (a pair of `---` lines around something that is not a list of keys is a horizontal rule, not a front matter);
- an image is a block of its own in the editor: it splits the paragraph that contains it, with a line break between the text before and after.
- `markdownToPlain(markdown)`: the plain text.
- `analyzeMarkdown(markdown)`: `{ plain, blocks }`, where each block of the top level carries its `type` (`paragraph`, `heading`, `list`…), the original Markdown (`raw`) and its `start`–`end` position in the plain text.

A comparison with the real editor over a set of documents (math, footnotes, code, front matter, lists, tables, images, HTML) gives the same text, except that the editor adds a trailing line break when the last block is a list, a table or a footnote definition: it does not matter for finding a quotation.