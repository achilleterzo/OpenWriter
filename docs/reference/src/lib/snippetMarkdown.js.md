
# snippetMarkdown.js

Source: [`src/lib/snippetMarkdown.js`](../../../../src/lib/snippetMarkdown.js)

Reading of the excerpts of the search results ([ProjectsHome.jsx](../components/pages/ProjectsHome.jsx.md)). An excerpt is a fragment of raw Markdown (cut in the middle of a bold text, a table, a link) with the words found between « ». Shown as it is, it fills the line with formatting symbols; `snippetTokens(text)` turns it into `[{ text, bold?, italic?, code?, strike?, mark? }]` to be drawn in a line.

It is tolerant, not a full parser (a fragment is not a document):

- **Block symbols removed:** heading marks (the heading text becomes bold), quote marks, list markers (`•`, the number of an ordered item, `☐` / `☑` for tasks), horizontal rules, code fences, table separator rows; the cells of a table row are joined with a middle dot. The excerpt of the search by meaning is on a single line, so a heading `#` left in the middle of the text is removed too.
- **Inline:** bold, italic, strikethrough and code become style; the text of a link or image (and of a reference link) is kept; footnote marks and HTML tags disappear; backslash escapes give the character; an autolink shows its address.
- **Cut symbols:** a `**` or `~~` left open by the cut is removed; an isolated `*` or an underscore inside a word stays.
- **Found words:** « » toggle the highlight (`mark`) and are carried through the styles, even when a highlight wraps a bold text. Neighbouring pieces with the same style are merged.

Tested in `tests/snippet-markdown.test.cjs`.
