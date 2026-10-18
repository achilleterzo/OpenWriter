# footnoteExtensions.js

Source: [`src/lib/footnoteExtensions.js`](../../../src/lib/footnoteExtensions.js)

Footnotes of extended Markdown: the reference `[^id]` in the text and the definition `[^id]: text` (also on several indented lines). They are neither numbered nor linked: they stay as they were written and are written back identical on save. Without these extensions `[^1]` was written as `\[^1\]`, and the definition was mistaken for a link definition and merged into the text.

- `FootnoteRef`: the reference in the text, an indivisible atom shown as a superscript with the label (`<sup data-footnote-ref>`, class `ow-footnote-ref`). It also provides the `insertFootnote` command: it inserts a reference after the selection and its definition `[^n]: ` after the other definitions (or at the end of the document), with the cursor ready to write it. The label is the first free number among those already used by references and definitions, and the command refuses inside a raw-text block (code, definitions).
- `FootnoteDefinition`: the definition, kept as raw text (class `ow-raw-block ow-footnote-definition`) so that long definitions or ones with several paragraphs are preserved anyway.

Both declare their Markdown tokenizer and renderer, so the source syntax survives the round trip.
