# src/appearance.js

Source: [`src/appearance.js`](../../../src/appearance.js)

Appearance preferences manager. The preferences are saved through [preferences.js](lib/preferences.js.md) in the application data (`openwriter.appearance`), from which older values in `localStorage` are migrated.

- Options: theme (`system`, `dark`, `light`), accent (`ash`, `violet`, `cyan`, `emerald`, `rose`, `amber`), font (`sans`, `serif`, `mono`), an optional Google font `fontFamily` chosen by name, font size 14–24 (default 17), line height (`compact` 1.5, `normal` 1.75, `relaxed` 2), text width (`narrow` 40rem, `medium` 56rem, `full` 100%), and the view (`endless` or `pages`). The option lists (`themes`, `accents`, `fonts`, `lineHeights`, `widths`, `views`) are exported, together with `fontSizeRange` and `defaultAppearance`.
- The paged view is currently hidden: `pagesViewEnabled` is `false`, so the endless view always applies even when a saved preference says otherwise (it has to be turned on here and in `electron/menu.cjs` at the same time).
- `loadAppearance` / `saveAppearance` persist a normalized object; invalid values fall back to defaults, and a font family is accepted only when it is short and free of the characters that would break the CSS value.
- `applyAppearance` writes `data-theme`, `data-accent` and `data-view` on the document root plus the `--editor-font`, `--editor-size`, `--editor-line-height` and `--editor-width` variables consumed by the styles; with `system` it follows `prefers-color-scheme` changes live. It also loads the chosen Google font and tells the main process which view is in use.
- `setProjectEditor({ font, fontFamily })` gives the open project's font precedence over the general one, without saving it in the preferences.
- `updateAppearance` (with subscribe/unsubscribe listeners) applies and notifies; getters: `getAppearance`.

