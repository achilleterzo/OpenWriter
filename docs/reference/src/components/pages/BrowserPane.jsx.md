# BrowserPane.jsx

Source: [`src/components/BrowserPane.jsx`](../../../../../src/components/BrowserPane.jsx)

Browser tab content: an isolated `<webview>` (dedicated persistent partition `persist:openwriter-browser`) with a toolbar above it. A tab restored after a restart opens at the page it was on.

The toolbar has back, forward and reload (turning into a spinner while loading), the address field, the button that opens the history, the screenshot button, and the reading view button with, once active, smaller/larger text, the light/dark switch, and "Save as Markdown".

- The address field behaves like a combobox: what is typed is read as a full URL, as a bare domain (getting `https://`), or as a DuckDuckGo search (`html.duckduckgo.com`). Focusing it opens suggestions from the project's history ([browser-history.cjs](../../../electron/browser-history.cjs.md)), ranked by how the address or the title matches, with the arrows to move, Enter to open, Escape to close, a button to remove a single page and one to clear the history; clicking a suggestion does not take the focus away from the field.
- Every visited page is added to the project's history, and the assistant's own navigations go to its separate history.
- The screenshot button saves the visible part of the page as a PNG in the project's `screenshots/` folder.
- The reading view extracts the article with [readerMode.js](../../lib/readerMode.js.md), shows it in a sandboxed iframe (`sandbox=""`, so the web content cannot run scripts), follows the application theme until the switch is used, and saves it as Markdown with the title and source, into the project. Navigating to a new page leaves the reading view.

A component that is not the active tab stays rendered off screen, so the assistant keeps being able to use it. The pane registers a controller per tab — navigate, back, forward, reload, evaluate JavaScript, web contents id, and current address and title — which the assistant uses for tab reading and screenshots.