---

# projectIcons.js

Source: [`src/lib/projectIcons.js`](../../../../src/lib/projectIcons.js)

Project icons on the renderer side: read once per folder and kept in memory until they change.

- `useProjectIcon(directory)`: the icon of a project as a data URL, or `null`. The first read calls `getProjectIcon` on the main process and caches the result (a failed read is cached as "no icon"). The cache key ignores case and the slash direction, so Windows paths match.
- `invalidateProjectIcon(directory)`: clears the cached icon and makes the components showing it read it again; to be called when the icon is chosen or removed.
- `chooseProjectIcon(directory, { unreadable })`: opens the system file picker and saves the chosen image as the project icon, returning `false` if the user cancels. An SVG is passed through; an animated GIF or WebP is kept as it is so the animation is not lost; every other raster format is decoded with the browser (which also reads GIF, WebP, BMP and ICO) and resized to at most 128 px on the longest side, then saved as a PNG. `rasterToPng` returns the PNG as base64, and `isAnimated` inspects the GIF graphic-control blocks or the WebP `VP8X` flags.

