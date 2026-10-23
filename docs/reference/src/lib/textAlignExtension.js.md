# textAlignExtension.js

Source: [`src/lib/textAlignExtension.js`](../../../src/lib/textAlignExtension.js)

Text alignment (left, centre, right, justified) for paragraphs and headings. Markdown has no syntax for it, so it is saved in the form GitHub and many other renderers understand, an HTML block with empty lines around it, so the text inside stays Markdown (bold, links…):

```text
<div align="center">

Text **centred**

</div>
```

- `TextAlign`: the `align` attribute on paragraphs and headings (`data-align` and `style="text-align: …"` in the HTML, read back from `data-align`, `style` or `align`), the `setTextAlign(align)` and `unsetTextAlign()` commands and the shortcuts `Mod-Shift-l` (left), `Mod-Shift-e` (centre), `Mod-Shift-r` (right), `Mod-Shift-j` (justify). It aligns only the paragraphs and headings the selection really touches: a triple click reaches the start of the following paragraph and a selection starting at the end of a line begins in the previous one.
- `AlignedParagraph` and `AlignedHeading`: write an aligned block inside `<div align="…">`, and leave `&nbsp;` for an empty paragraph that follows another one. A paragraph holding nothing but an image inside a link — the badge `[![alt](img)](url)` — is parsed as the block image itself instead of a paragraph: the linked image is a block node (see [DocumentLink in DocumentPane.jsx](../components/pages/DocumentPane.jsx.md)), so the paragraph around it no longer leaves a blank line in the file.
- `AlignedBlocks`: reads `<div align="…">` blocks (only when they contain nothing but paragraphs and headings) and also `<p align="center">…</p>` and `<h2 align="right">…</h2>`, with `style="text-align:…"` allowed, writing them back as a `<div>` block. Tags with other attributes (`class`, `id`…) are not touched and stay raw HTML, written back identical, without losing the alignment.

The accepted values are those of `ALIGNMENTS` (`left`, `center`, `right`, `justify`).