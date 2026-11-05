---

# FileIcon.jsx

Source: [`src/components/FileIcon.jsx`](../../../../../src/components/FileIcon.jsx)

The file-type icon of the file tree ([FileExplorer.jsx](FileExplorer.jsx.md)): a colored SVG chosen from the file name (`iconNameForFile`: exact names such as `Dockerfile` or `package.json` first, then prefixes such as `tsconfig`, then the extension, then a generic file). It is the same icon set as the Git-Gui project (same author, MIT), whose artwork derives from [uiwjs/file-icons](https://github.com/uiwjs/file-icons) (MIT, noted in the file header); the SVGs are inlined, so it needs nothing at runtime. The Markdown icon is drawn almost black in the original and would vanish on a dark theme, so it uses `currentColor` and the component gives it a light gray by default (`text-slate-300`).
