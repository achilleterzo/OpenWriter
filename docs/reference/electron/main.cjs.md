# electron/main.cjs

Source: [`electron/main.cjs`](../../electron/main.cjs)

Main process entry point. Creates the application window, registers every IPC handler, and owns the global state shared by the backend stores: the current project path, the provider layer, the project file, the chat, notes, bookmarks, memory, links and references stores, the skills store, the fonts and browser history stores, and the project tools.

Document reading is centralized in this module. Markdown files are returned as-is; DOCX files are converted through mammoth; PDF text and images come from [pdf-import.cjs](pdf-import.cjs.md), with each image put back where it was on the page and embedded as `data:` until the save puts it in `images/`. Sessions are stored per project in the Electron user data directory, including open tabs, unsaved drafts, the pending assistant edits, and the side panel state.

The `ow-file://` scheme is registered as privileged and serves the document images read-only. When no project is open, the built-in main project (`main/` in the application data) takes its place for conversations, notes, memory, context and skills, and always keeps the history and notes of documents opened from outside the project.

Other responsibilities:

- File dialogs for opening and saving documents, with supported-extension filters, and documents handed over by the operating system (`.md`, `.markdown`, `.mdown`), kept for the renderer if it is not ready yet.
- Workspace operations limited to the project directory: rename, delete with a confirmation dialog and trash (a Markdown document goes to the trash together with its DOCX/PDF original, which is named in the confirmation; the answer lists every path deleted so that the open tabs close) (`workspace:delete-paths` deletes several items with one confirmation that counts them and lists the first names; an item inside another deleted folder is not counted twice), reveal in the file manager, unique-destination import with drag and drop, creating an entry, moving an item into a folder, and directory listing that hides dot folders, `node_modules`, `dist`, and `out`. Files can be copied or cut to the system clipboard and pasted back ([file-clipboard.cjs](file-clipboard.cjs.md)).
- Moving a document carries its images along ([document-images.cjs](document-images.cjs.md)) and moves history, notes, bookmarks and memory entries with it.
- Export to PDF through a hidden print window, to DOCX through html-to-docx, and to a self-contained Markdown with the images embedded ([markdown-embed.cjs](markdown-embed.cjs.md)).
- Project extras: icons ([project-icon.cjs](project-icon.cjs.md)), linked documents, reference folders, the shareable setup file ([project-pack.cjs](project-pack.cjs.md)), sub-projects moved in and out, and moving a whole project.
- Bookmarks, memory and the browser history (the user's and the assistant's, kept apart) through their stores.
- Images: downloads, normalization and screenshots through [images.cjs](images.cjs.md), imported images placed in the `images/` folder next to the document, screenshots of a browser tab saved in the project's `screenshots` folder, and the descriptions the assistant saves of project images (`images:read-description` / `images:write-description`: one Markdown file per image in `.ow/image-descriptions/`, named after the project path of the image and holding at most 20,000 characters; the assistant writes them with `describe_image` and gets them back instead of the image, unless it asks for the image again).
- Spell-check configuration, with project settings overriding global languages, and edit context-menu events sent to the renderer; confirmations asked by the main process go to the renderer's internal dialog (`dialog:ask` / `dialog:answer`).
- Chat attachments chosen by the user (`chat:pick-attachments`, `chat:read-attachment`, `chat:prepare-image`): only images (up to 8 MB, normalized; formats Electron cannot decode come back as `raw-image` for the renderer to convert) and PDF files (up to 20 MB, `%PDF-` header checked), also from outside the project.
- Writing skills through the `skills:*` channels; `skills:import-file` picks a Markdown file and returns its parsed fields through `skillFromMarkdown` without saving.
- UI preferences in the application data (`preferences:load`, read synchronously at startup, and `preferences:set`), with `localStorage` as a fallback on the renderer side.
- Fonts: the Google Fonts catalog, the list of installed fonts, install and remove ([fonts.cjs](fonts.cjs.md)).
- The MCP server: `mcp:get-config` returns the command and arguments an agent's client has to use ([mcp-server.cjs](mcp-server.cjs.md)). The main process also runs the local bridge ([mcp-bridge.cjs](mcp-bridge.cjs.md)) that forwards the agent's requests to the interface (`mcp:request` / `mcp:response`) — the editor edits, opening a document or a project in the app, and a task handed to the assistant — gated by the preference `openwriter.mcpEdit`. Paths are compared through [path-compare.cjs](path-compare.cjs.md), and confirmations (delete, move) are asked in the interface (`dialog:ask` / `dialog:answer`).
- Window state persistence, restored only when still visible on a connected display.
- The BrowserWindow hosting the renderer loads the Vite dev server in development and the built bundle in production.

