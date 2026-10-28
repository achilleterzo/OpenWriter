---

# readerMode.js

Source: [`src/lib/readerMode.js`](../../../../src/lib/readerMode.js)

The reading view of a web page: it extracts the article and turns it into a clean page or into Markdown.

- `extractArticle(html, url)`: the article as `{ title, byline, siteName, content, url }`, or `null` when nothing readable is found. It uses Mozilla's Readability (the same algorithm as Firefox Reader View) and inserts a `<base>` element with the page address, so links and images become absolute.
- `readerDocument(article, { dark, size })`: the HTML of the reading view, with a light or dark palette and the given text size. It goes into an iframe with an empty `sandbox`, since the content comes from the web and must not run scripts.
- `articleToMarkdown(article, { sourceLabel })`: the article as Markdown, converted with Turndown and the GFM plugin, with the title and a blockquote line giving the source and the address.
- `articleFileName(article)`: a file name derived from the title, with the characters not allowed in a name replaced and the length capped, falling back to the host name.

