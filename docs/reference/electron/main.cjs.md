# electron/main.cjs

Source: [`electron/main.cjs`](../../electron/main.cjs)

Main process entry point. Creates the application window, registers every IPC handler, and owns the global state shared by the backend stores: the current project path, the provider layer, the project file, the chat and notes stores, and the project tools.

Document reading is centralized in this module. Markdown files are returned as-is; DOCX files are converted through mammoth; PDF text is extracted through pdf-parse and wrapped in paragraphs. Sessions are stored per project in the Electron user data directory, including open tabs, unsaved drafts, and the side panel state.

Other responsibilities:

- File dialogs for opening and saving documents, with supported-extension filters.
- Workspace operations limited to the project directory: rename, delete with a confirmation dialog and trash, reveal in the file manager, unique-destination import with drag and drop, and directory listing that hides dot folders, `node_modules`, `dist`, and `out`.
- Export to PDF through a hidden print window and to DOCX through html-to-docx.
- Spell-check configuration, with project settings overriding global languages, and edit context-menu events sent to the renderer.
- Chat attachments chosen by the user (`chat:pick-attachments`, `chat:read-attachment`, `chat:prepare-image`): only images (up to 8 MB, normalized; formats Electron cannot decode come back as `raw-image` for the renderer to convert) and PDF files (up to 20 MB, `%PDF-` header checked), also from outside the project.
- Writing skills through the `skills:*` channels; `skills:import-file` picks a Markdown file and returns its parsed fields through `skillFromMarkdown` without saving.
- Window state persistence, restored only when still visible on a connected display.
- The BrowserWindow hosting the renderer loads the Vite dev server in development and the built bundle in production.

