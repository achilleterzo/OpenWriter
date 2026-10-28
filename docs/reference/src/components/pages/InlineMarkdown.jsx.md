# InlineMarkdown.jsx

Source: [`src/components/InlineMarkdown.jsx`](../../../../../src/components/InlineMarkdown.jsx)

Draws an inline Markdown fragment — `**bold**`, `*italic*` or `_italic_`, `~~strikethrough~~`, `` `code` ``, `[link](url)`, and escaped characters — with its styles, so that the quoted text and the proposed text of a note appear as they are formatted in the document, instead of without styles or with the asterisks.

The parser is a single regular expression scanned with `matchAll`; the emphasis and link contents are parsed again recursively, so nested Markdown works. Only the inline forms are understood: there are no blocks, headings or lists, since the component is meant for fragments of text. Links keep their text, underlined with a dotted line, and their address is not shown. Plain text between the matches is returned as it is.
