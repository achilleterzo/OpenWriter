# electron/markdown-tokens.cjs

Source: [`electron/markdown-tokens.cjs`](../../electron/markdown-tokens.cjs)

The Markdown analyzer of the main process: `marked` with the same extensions as the editor — front matter, footnote definitions and references, block and inline formulas. So what is code, a formula or a footnote is decided the way the editor decides it, and not by regular expressions applied to the source (which would also touch the examples inside a code block).

The expressions mirror those of the editor ([rawMarkdownExtensions.js](../src/lib/rawMarkdownExtensions.js.md), [footnoteExtensions.js](../src/lib/footnoteExtensions.js.md), [mathExtensions.js](../src/lib/mathExtensions.js.md)) and have to be kept aligned: a comparison of the plain text with the one of the real editor catches a drift. The front matter is recognised only at the start of the document and only if its content looks like keys (same check as the editor).

`lex(markdown)` returns `{ source, tokens }`: the source with newlines normalised to `\n` (the indexes of the tokens refer to it) and its tokens. Used by [markdown-plain.cjs](markdown-plain.cjs.md) and [markdown-images.cjs](markdown-images.cjs.md).
