# electron/project-tools.cjs

Source: [`electron/project-tools.cjs`](../../electron/project-tools.cjs)

File tools used by the AI assistant. Every path is resolved against the project root, and `.ow`, `.git`, and `node_modules` are excluded everywhere, with errors for paths outside the project or inside excluded directories.

Tools:

- `listDirectory`: entries with types and sizes, capped at 300 items with a truncation flag.
- `readFile`: text documents, plus DOCX and PDF through the app's converter; offsets and limits cap each read (default 20,000, max 40,000 characters); binary files are rejected.
- `readImage`: png, jpg, jpeg, gif, webp, bmp up to 8 MB.
- `createDirectory`: creates a folder and missing parents, no-op if it exists.
- `createFile`: only `.md` and `.txt`, never overwriting, with same-name detection across the project to avoid duplicates, up to 500,000 characters.
- `resolvePath`: absolute path of a project file under the same restrictions.