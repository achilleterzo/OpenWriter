# electron/fonts.cjs

Source: [`electron/fonts.cjs`](../../../electron/fonts.cjs)

Google Fonts downloaded on request and kept in the application data directory, so that after the installation they work without a connection. Only latin and latin-ext subsets are taken: enough for the interface languages and light enough to keep.

`createFontsStore({ directory })`:

- `catalog()`: the families of the Google Fonts catalog that have a latin subset, most popular first, as `{ family, category, variants }` with `category` one of `sans`, `serif`, `mono`, `other`. It is cached in memory for the session.
- `install(family)`: downloads the font and writes `<slug>.json` as `{ family, category, css }`, where the CSS is the `@font-face` rules of the latin and latin-ext subsets with the woff2 files embedded as `data:` URIs. It asks for the regular and bold weights, with the italics when the family has them (falling back to the plain request if the spec is refused).
- `list()`: the installed fonts, by family name; a damaged file is ignored.
- `remove(family)`: deletes the font file.

The HTTP user agent is that of a modern browser, so Google answers with woff2 files split by subset.