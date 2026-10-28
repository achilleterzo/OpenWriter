# preferences.js

Source: [`src/lib/preferences.js`](../../../../src/lib/preferences.js)

Interface preferences (theme, language, panel widths, notes view…). They live in the application data directory, in a file managed by the main process, and not only in the browser's `localStorage`: that depends on the address the page is loaded from (development server, installed application, another port) and on the installation folder, so changing any of them lost everything.

- `getPreference(key)`: the saved value (a string) or `null`. Values already in `localStorage` from earlier versions are moved into the application data the first time they are read.
- `setPreference(key, value)`: saves the value through the main process and also in `localStorage`, which remains as a fallback (and for whoever opens the page in a browser).

Values are cached in memory for the session, so a read does not go through the bridge every time.