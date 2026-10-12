# electron/project-tools.cjs

Source: [`electron/project-tools.cjs`](../../electron/project-tools.cjs)

File tools used by the AI assistant. Every path is resolved against the project root, and `.ow`, `.git`, and `node_modules` are excluded everywhere (any path segment), with errors for paths outside the project or inside excluded directories.

Tools:

- `listDirectory`: entries with types and sizes, capped at 300 items with a truncation flag.
- `readFile`: text documents (`.md`, `.markdown`, `.txt`), plus DOCX and PDF through the app converter (stripped to readable text); offsets and limits cap each read (default 20,000, max 40,000 characters); files over 2 MB or containing NUL bytes are rejected as binary/too large.
- `readImage` (internal support for `images.cjs`): png, jpg, jpeg, gif, webp, bmp up to 8 MB.
- `createDirectory`: creates a folder and missing parents, no-op if it exists.
- `createFile`: only `.md` and `.txt` (`.md` added when missing), never overwriting an existing file, up to 500,000 characters; `allowSameName` can bypass the cross-project same-name duplicate check (walk capped at depth 8 / 5000 entries).
- `resolvePath`: absolute path of a project file under the same restrictions.

