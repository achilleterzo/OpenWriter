# Documentation Coverage Check

A quick way to check that the reference pages still match the source tree.

## Source tree

- `electron/`: `ai-providers`, `atomic-write`, `bookmarks-store`, `browser-history`, `chat-store`, `document-images`, `file-clipboard`, `fonts`, `i18n`, `images`, `main`, `markdown-embed`, `markdown-images`, `markdown-plain`, `markdown-tokens`, `mcp-bridge`, `mcp-server`, `memory-store`, `menu`, `notes-store`, `path-compare`, `pdf-import`, `preload`, `project-file`, `project-icon`, `project-links`, `project-owner`, `project-pack`, `project-references`, `project-tools`, `projects`, `skills-store`, `updates`.
- `src/`: `App.jsx`, `appearance.js`, `main.jsx`, `styles.css`, `hooks/useDocumentFileCommands.js`, `i18n/index.js` (and the five locale files), and the helpers in `src/lib/`.
- `src/lib/`: `aiOptions`, `aiTools`, `alertExtension`, `anchoring`, `annotationExtension`, `bookmarkExtension`, `bookmarkLinks`, `chatAttachments`, `documentStats`, `editorInsert`, `embeddedImages`, `fonts`, `footnoteExtensions`, `imageExtension`, `imagePaths`, `inlineDiff`, `keepSelectionExtension`, `layout`, `lineDiff`, `listItemExtension`, `markdownSyntax`, `markExtensions`, `mathExtensions`, `mcpRequests`, `pathCompare`, `pendingChangesExtension`, `preferences`, `projectIcons`, `quickActions`, `rawMarkdownExtensions`, `readerMode`, `searchExtension`, `selectionText`, `skills`, `smartDashesExtension`, `textAlignExtension`, `updateSchedule`.
- `src/components/`: one page per component, listed in [components.md](components.md).

## Not documented

- `src/app.js`: an empty placeholder file.
- `src/assets/provider-logos/`: the SVG logos of the AI providers, used as images.

## Last review of the pages

The pages were read against the source again after the latest changes, so they now also describe:

- the MCP tools `open_document`, `open_project` (with `create`), `ask_agent`, `list_documents` recursive by default and `read_project` as its alias ([mcp-server.cjs.md](electron/mcp-server.cjs.md)), the tools allowed through the bridge ([mcp-bridge.cjs.md](electron/mcp-bridge.cjs.md)) and their execution in the app ([mcpRequests.js.md](src/lib/mcpRequests.js.md), [App.jsx.md](src/App.jsx.md));
- `list_directory` recursive by default and the `describe_image` / `view_image` pair with its saved descriptions in `.ow/image-descriptions/` ([aiTools.js.md](src/lib/aiTools.js.md), [main.cjs.md](electron/main.cjs.md));
- the attachments of a conversation named after the SHA-256 of their content and the clean-up of the orphan ones ([chat-store.cjs.md](electron/chat-store.cjs.md));
- the aligned paragraph that holds nothing but a linked image ([textAlignExtension.js.md](src/lib/textAlignExtension.js.md)).

## Checks

- Every page has an H1 equal to the module path and a `Source:` line linking the physical file.
- Every page listed in `docs/INDEX.md` exists, and every existing page is listed there.
- `docs/reference/src/lib/lib.md` and `docs/reference/src/components/components.md` list the same pages as `docs/INDEX.md`.

