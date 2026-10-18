# electron/markdown-plain.cjs

Source: [`electron/markdown-plain.cjs`](../../electron/markdown-plain.cjs)

The plain text of a Markdown document as the OpenWriter editor sees it: blocks separated by `\n`, without the Markdown symbols (no asterisks, list markers, `#`, links reduced to their text, images absent). Notes are anchored to this text (see [anchoring.js](../../src/lib/anchoring.js.md)), so a quotation given as plain text is found again in the editor.

- `markdownToPlain(markdown)`: the plain text.
- `analyzeMarkdown(markdown)`: `{ plain, blocks }`, where each block of the top level carries its `type` (`paragraph`, `heading`, `list`…), the original Markdown (`raw`) and its `start`–`end` position in the plain text.

The analysis drops the front matter and keeps footnote references `[^1]` out of the plain text (they are elements without text in the editor; marked would mistake them for a link reference), while leaving them as they were in `raw`.
