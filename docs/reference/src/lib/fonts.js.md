# fonts.js

Source: [`src/lib/fonts.js`](../../../src/lib/fonts.js)

Editor fonts on the renderer side: a small set of Google Fonts bundled with the application (loaded only when needed) and the ones installed from the Google Fonts catalog. Purely aesthetic: the font goes neither into the document nor into the exports.

- `curatedFonts`: the bundled families, each with a `category` (`sans`, `serif`, `mono`, used as a fallback while the font loads) and a `load` that imports its `@fontsource` stylesheets for the latin and latin-ext subsets, regular and bold, upright and italic.
- `loadFamily(family)`: makes a bundled family available (idempotent; a failed load is forgotten so it can be retried).
- `getInstalledFonts()` and `subscribeFonts(listener)`: the installed fonts and a subscription on their changes.
- `refreshInstalledFonts()`: re-reads the installed fonts and injects their CSS as `<style data-installed-font>` in the page head.
- `installFont(family)` / `removeFont(family)`: install or remove a font through the bridge to [fonts.cjs](../../../electron/fonts.cjs.md), injecting or dropping its CSS and notifying the subscribers.
- `fetchCatalog()`: the Google Fonts catalog, for the picker.

The font bridge is `window.electronAPI.fonts`; without it (a plain browser) only the bundled families are available.
