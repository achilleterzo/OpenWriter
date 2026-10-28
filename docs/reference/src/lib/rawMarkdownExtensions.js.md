---

# rawMarkdownExtensions.js

Source: [`src/lib/rawMarkdownExtensions.js`](../../../../src/lib/rawMarkdownExtensions.js)

Parts of Markdown the editor cannot represent but that must not be lost or altered on save: the YAML front matter at the top of the file, block HTML, and inline HTML tags. They stay raw text, written back unchanged.

- `FrontMatter`: the `---` … `---` block at the start of a document, kept verbatim. The first line must look like YAML (a key-value pair or a comment), so an initial `---` followed by another `---` further down stays a horizontal rule.
- `HtmlBlock`: block HTML (`<div>`, `<!-- -->` comments…) as recognized by marked, with the token "html".
- `HtmlInline`: HTML tags in the middle of the text (`<span>`, `</span>`, `<br>`, `<!-- -->`), each one an indivisible atom showing the tag, kept in the `html` attribute and written back as it is.

Each extension defines its own `renderHTML` (a `<pre>` with a `data-` marker, class `ow-raw-block`, or an inline `span.ow-html-inline`) and its Markdown tokenizer and renderer, so the source text survives the round trip.

