# electron/project-tools.cjs

Source: [`electron/project-tools.cjs`](../../../electron/project-tools.cjs)

File tools used by the AI assistant (and by the MCP server). Every path is resolved against the project root, and `.ow`, `.git` and `node_modules` are excluded everywhere (any path segment), with errors for paths outside the project or inside excluded directories. A path starting with `@` is a reference folder, which is read-only and cannot be opened as a project path.

Tools:

- `listDirectory(relativePath, { sort })`: entries with type, size and modification time (`modified`, in milliseconds), capped at 300 items with a truncation flag; `sort` is `name` (folders first) or `date` (most recently modified first, folders and files together, reading up to 3,000 dates before cutting the list). A folder carrying its own `.ow` is flagged as a project.
- `readFile(relativePath, { offset, limit, startLine, endLine, absolute })`: text documents (`.md`, `.markdown`, `.txt`), plus DOCX and PDF through the app converter, reduced to readable text with headings and line breaks; by characters, reads come in chunks (default 20,000 characters, max 40,000) and return `totalChars`, `truncated` and `nextOffset`; by lines, `startLine`/`endLine` return `totalLines`, `startLine`, `endLine`, `truncated` and `nextLine` (50 lines when the end is missing, still capped at 40,000 characters), so a match found by a search is read where it is. Files over 2 MB or containing NUL bytes are rejected as too large or binary. `absolute` reads a document linked to the project, already checked by the caller.
- `readImage(relativePath)`: png, jpg, jpeg, gif, webp, bmp up to 8 MB, used for the assistant's vision tools.
- `createDirectory(relativePath)`: creates a folder and its missing parents; an existing folder is not an error, an existing file is.
- `createFile(relativePath, content, { allowSameName })`: only `.md` and `.txt` (`.md` is added when the name has no extension), up to 500,000 characters, never overwriting an existing file (`wx`). Unless `allowSameName` is set, a document with the same name anywhere in the project stops the creation, reporting where it already is (walk capped at depth 8 and 5,000 entries).
- `search({ pattern, regex, caseSensitive, path, glob, output, context, maxResults, overrides })`: the text search, run on [project-search.cjs](project-search.cjs.md) inside a project folder — the same search the MCP server and the internal assistant use, with unsaved editor text taking the place of the file on disk.
- `resolvePath(relativePath)`: the absolute path of a project file under the same restrictions.

