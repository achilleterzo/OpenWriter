# BrowserPane.jsx

Source: [`src/components/BrowserPane.jsx`](../../../../../src/components/BrowserPane.jsx)

Browser tab content: an isolated `<webview>` (dedicated persistent partition `persist:openwriter-browser`) with a toolbar above it. A tab restored after a restart opens at the page it was on.

The toolbar has back, forward and reload (turning into a spinner while loading), the address field, the button that opens the history, the screenshot button, and the reading view button with, once active, smaller/larger text, the light/dark switch, and "Save as Markdown".

- The address field behaves like a combobox: what is typed is read as a full URL, as a bare domain (getting `https://`), or as a DuckDuckGo search (`html.duckduckgo.com`). Focusing it opens suggestions from the project's history ([browser-history.cjs](../../../electron/browser-history.cjs.md)), ranked by how the address or the title matches, with the arrows to move, Enter to open, Escape to close, a button to remove a single page and one to clear the history; clicking a suggestion does not take the focus away from the field.
- Every visited page is added to the project's history, and the assistant's own navigations go to its separate history.
- The screenshot button saves the visible part of the page as a PNG in the project's `screenshots/` folder.
- The context menu of a page and of an image offers the actions of the page (opening links, copying addresses, saving an image to the project, asking the assistant about an image, cropping the screenshot). An image returned as an SVG — Electron cannot decode it — is rasterised to a PNG with [svgRaster.js](../../lib/svgRaster.js.md) before it reaches the assistant.
- A private or local address is handled by [webAddress.js](../../lib/webAddress.js.md), so the assistant's own restrictions on private hosts apply to what is opened here.
- The reading view extracts the article with [readerMode.js](../../lib/readerMode.js.md), shows it in a sandboxed iframe (`sandbox=""`, so the web content cannot run scripts), follows the application theme until the switch is used, and saves it as Markdown with the title and source, into the project. Navigating to a new page leaves the reading view.

A component that is not the active tab stays rendered off screen, so the assistant keeps being able to use it. The pane registers a controller per tab — navigate, back, forward, reload, evaluate JavaScript, web contents id, and current address and title — which the assistant uses for tab reading and screenshots.

**Star (add to the context)**: a star button next to the reading view. Clicking it saves the page as a **web reference** of the project: the page is read like the reading view does (the article, or the plain text if there is none), converted to Markdown and stored by `webRefs.save` in `.ow/web` ([web-references.cjs](../../../electron/web-references.cjs.md)); the star turns yellow while the page is saved (matched by its normalized address, so a `#anchor` or `utm_*` parameters do not matter) and clicking it again removes the page from the context. It is disabled on pages that are not http or https. The saved pages are listed in the side tab [WebReferencesPanel.jsx](WebReferencesPanel.jsx.md); the assistant can search and read them (`@web/…`).