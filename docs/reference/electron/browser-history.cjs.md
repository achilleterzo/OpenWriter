# electron/browser-history.cjs

Source: [`electron/browser-history.cjs`](../../electron/browser-history.cjs)

History of the addresses visited in the built-in browser, one per project, in `.ow/browser-history.json` as `[{ url, title, visitedAt }]`, most recent first and one entry per address, up to 500.

`createBrowserHistory({ getProjectPath, fileName })` creates a store for one file name: the application keeps two of them, the user's (`browser-history.json`) and the assistant's (`browser-history-agent.json`), which never mix. Only `http` and `https` addresses are kept, without the `#…` fragment (the page, not the position in the page), and only up to 2,000 characters.

- `list()`: the entries, most recent first.
- `add({ url, title })`: records a visit, moving the address back to the top and keeping the earlier title when the new one is empty (title capped at 200 characters); an address that cannot be cleaned leaves the list untouched.
- `remove(url)`: drops one address.
- `clear()`: empties the history.

Writes go through [atomic-write.cjs](atomic-write.cjs.md); an unreadable file counts as an empty history.
