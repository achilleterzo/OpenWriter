---

# BrowserPane.jsx

Source: [`src/components/BrowserPane.jsx`](../../../../../src/components/BrowserPane.jsx)

Browser tab content: an isolated `<webview>` (dedicated persistent partition `persist:openwriter-browser`, `about:blank` at start) with a toolbar above it.

The toolbar has back, forward and reload (turning into a spinner while loading), the address field, and the reading view button with, once active, smaller/larger text, the light/dark switch, and "Save as Markdown". What is typed in the field is read as a full URL, as a bare domain (getting `https://`), or as a DuckDuckGo search (`html.duckduckgo.com`); submitting loads the address, and the field follows the page on navigation.

The reading view extracts the article with [readerMode.js](../../lib/readerMode.js.md), shows it in a sandboxed iframe (`sandbox=""`, so the web content cannot run scripts) with the chosen theme and text size, and saves it as Markdown with the title and source, into the project. Navigating to a new page leaves the reading view.

A component that is not the active tab stays rendered off screen, so the assistant keeps being able to use it. The pane registers a controller per tab — navigate, back, forward, reload, evaluate JavaScript, web contents id, and current address and title — which the assistant uses for tab reading and screenshots.