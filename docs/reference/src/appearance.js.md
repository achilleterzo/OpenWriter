# src/appearance.js

Source: [`src/appearance.js`](../../src/appearance.js)

Appearance preferences manager, persisted in `localStorage` (`openwriter.appearance`).

- Options: theme (`system`, `dark`, `light`), accent (`violet`, `cyan`, `emerald`, `rose`, `amber`), font (`sans`, `serif`, `mono`), font size 14–24 (default 17), line height (`compact` 1.5, `normal` 1.75, `relaxed` 2), text width (`narrow` 40rem, `medium` 56rem, `full` 100%).
- `loadAppearance` / `saveAppearance` persist a normalized object; invalid values fall back to defaults.
- `applyAppearance` writes `data-theme` / `data-accent` on the document root plus `--editor-font`, `--editor-size`, `--editor-line-height`, and `--editor-width` CSS variables consumed by the styles; with `system` it follows `prefers-color-scheme` changes live.
- `updateAppearance` (with subscribe/unsubscribe listeners) applies and notifies; getters: `getAppearance`.

