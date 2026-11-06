---

# WebReferencesPanel.jsx

Source: [`src/components/WebReferencesPanel.jsx`](../../../../../src/components/WebReferencesPanel.jsx)

The side tab **Web references** (globe icon): the web pages added to the project context with the star of the browser tab ([web-references.cjs](../../../electron/web-references.cjs.md)). Each row shows the title, the site and the date it was saved (and "Copy missing" if the Markdown copy is gone) and three buttons: open the page (in a new browser tab at that address, `workspace.openBrowser(url)`), open the saved copy (the Markdown file in `.ow/web`, in the editor) and remove from the context (deletes the copy and the entry). The list reloads when `version` changes (the star of the browser tab and this panel share the counter `webRefsVersion` of `App.jsx`).

Each row also says who saved the page when it was not the user ("saved by the assistant" or "saved by an agent") and shows the last check date; the tooltip has the address and the saved and last checked dates.
