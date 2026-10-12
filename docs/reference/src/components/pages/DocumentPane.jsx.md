# DocumentPane.jsx

Source: [`src/components/DocumentPane.jsx`](../../../../../src/components/DocumentPane.jsx)

Editor surface for one document. Creates and registers the Tiptap editor instance, applies Markdown content for markdown, html, or pdf formats, keeps scroll positions per tab, forwards live content changes as dirty marks, and exposes the editor to the tool bridge. Spell-checking underline comes from the Chromium session dictionaries.