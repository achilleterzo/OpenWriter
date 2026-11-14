# src/lib/exportHtml.js

Source: [`src/lib/exportHtml.js`](../../../../src/lib/exportHtml.js)

The HTML of the document as it goes to PDF, print and DOCX. In the editor the anchors of a document (`<a id="name"></a>`) are drawn as an icon; here they become real, invisible anchors again, so that the `#name` links of the document are internal links of the PDF. Headings get the id GitHub would give them, so `#heading` links work too.

- `exportableHtml(html)`: parses the string with `DOMParser` (an empty or falsy value gives an empty body) and returns `doc.body.innerHTML`.
- Anchors: every element carrying `data-html-anchor` (a block) or `data-html-inline` is replaced by the anchors its attribute describes, read with `anchorIds` ([rawMarkdownExtensions.js](rawMarkdownExtensions.js.md)); each id is added to the set of used ids. An element whose attribute yields no id is removed when it is a block and left as it is when it is inline.
- Headings: every `h1`–`h6` without an id gets the slug of its text (`headingSlug` of [bookmarkLinks.js](bookmarkLinks.js.md): lowercase, dashes); a slug already used takes `-1`, `-2`, and so on. A heading whose text gives no slug stays without an id.
- The ids of headings that already had one count as used, so a generated slug never collides with an existing anchor.
