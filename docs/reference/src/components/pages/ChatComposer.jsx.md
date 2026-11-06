---

# ChatComposer.jsx

Source: [`src/components/ChatComposer.jsx`](../../../../../src/components/ChatComposer.jsx)

The message field of the chat: a restricted Markdown editor without toolbar (Tiptap with bold, italic, strike, inline code, links and lists; headings, quotes, code blocks and rules are off). Markdown shortcuts work as you type (`- `, `* `, `+ ` or `1. ` start a list, `**bold**`, `*italic*`, `` `code` ``), and pasted plain text that looks like Markdown is interpreted (pasted headings become bold). Enter sends and Shift+Enter breaks the line; inside a list Enter makes the next item (an empty one leaves the list) and Ctrl/Cmd+Enter sends. An image on the clipboard becomes an attachment, and with an empty field the arrow keys or Tab accept the suggested prompt. The placeholder disappears as soon as there is any structure, even only the bullet of a new list. `getMarkdown()` gives the text sent to the model, without the backslashes the serializer adds before special characters (so `snake_case` stays as typed); `setValue(markdown)` and `focus()` are used by the chat panel.
