---

# webReferences.js

Source: [`src/lib/webReferences.js`](../../../../src/lib/webReferences.js)

Saving a web page as a reference of the project ([web-references.cjs](../../electron/web-references.cjs.md)) and refreshing it: one way for everyone, the star of the browser tab (the user), the assistant tools and the MCP requests. The page is read in the app's browser, so with its scripts run, as the user sees it.

- `pageToReference(page)`: what `CAPTURE_SCRIPT` returns from the page (HTML, address, title, text) → `{ url, title, markdown, siteName }`: the article extracted as the reading view does ([readerMode.js](readerMode.js.md)), or the page text if there is none.
- `saveFromController(api, controller, { source, checkOnly, matchUrl })`: saves (or checks) the page that a browser controller shows now; `matchUrl` is the address of the copy to refresh when the page redirected elsewhere. It announces the change with the window event `openwriter:web-references-changed` (`App.jsx` listens: panel and star update).
- `saveFromUrl({ api, getBrowser }, url, { source })`: opens the address in a **background browser tab** (created the first time and reused, so the user's own tab is never navigated; only public http(s) addresses, see [webAddress.js](webAddress.js.md)) and saves it.
- `refreshReference({ api, getBrowser }, reference, { checkOnly, source })`: reopens a saved page (found by id, file name, address or title) and compares: unchanged, changed, or updated.
- `describeSavedReference(entry)`: the answer for the model: saved, updated (with the lines that changed), changed (not updated: call again without `check_only`) or up to date.
