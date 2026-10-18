---
# electron/project-icon.cjs

Source: [`electron/project-icon.cjs`](../../electron/project-icon.cjs)

The icon of a project, kept in `<project>/.ow/` as `icon.png` (any image, already resized to 128 px by the interface), `icon.svg` (copied as it is), or `icon.gif` / `icon.webp` (animated, copied as they are). Only one of the four is kept.

- `getIcon(directory)`: the icon as a `data:` URL (base64), or `null`. The interface puts it in an `<img>`, so an SVG cannot run scripts. An unreadable icon counts as no icon.
- `readSource(source)`: the content of the file picked by the user, `{ extension, data }` with base64 data. Only the extensions in `ICON_EXTENSIONS` (`png`, `jpg`, `jpeg`, `gif`, `webp`, `bmp`, `ico`, `avif`, `svg`) are accepted; SVG is capped at 512 KB, other formats at 8 MB.
- `saveIcon(directory, kind, data)`: writes `svg`, `png`, `gif` or `webp`, removing the other files first, and returns the new icon. SVG text must contain an `<svg>` element (512 KB max), a PNG is checked against its signature (512 KB max), and animated GIF/WebP are validated and capped at 1 MB so they stay light to load in the lists. The animated formats are kept as they are to preserve the animation; every other raster format is decoded by the interface with the browser (which also reads GIF, WebP, BMP and ICO, unlike Electron's `nativeImage`) and saved as a resized PNG.
- `removeIcon(directory)`: deletes every icon file.

