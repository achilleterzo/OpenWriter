# MarkdownMessage.jsx

Source: [`src/components/MarkdownMessage.jsx`](../../../../../src/components/MarkdownMessage.jsx)

Renders a text of the assistant as Markdown inside the chat, with `react-markdown` and `remark-gfm` (tables, strikethrough, task lists). The model's text becomes React elements: raw HTML is never interpreted.

- Props: `children` (the Markdown), `onAccent` (text on an accent-coloured background: links stay white and readable), `softBreaks` (single line breaks become visible, as in the text the user typed) and `inline` (no block element: for labels inside buttons — the paragraphs become `<span>` and the wrapper a `<span>`).
- The element map (`components`) gives Tailwind classes to paragraphs, headings (an `h1` shown as an `h3`, a message being smaller than a document), lists, quotes, tables and rules.
- Code: a fenced block (`CodeBlock`) shows the language in a small header and a **Copy** button that puts the block in the clipboard exactly as written (`plainText` over the children, the final newline removed) and shows a check for a moment; inline code gets a small coloured background. A `code` with a `language-` class or containing a newline is treated as a block, anything else as inline.
- Images are not rendered as images: an `img` becomes a link with its alt text (or the address), opened in a new tab with `rel="noreferrer noopener"`; every link does the same.
- The component is memoised, and the wrapper breaks long words so a long address cannot widen the message column.

