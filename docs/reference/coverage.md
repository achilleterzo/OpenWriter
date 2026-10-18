# Documentation Coverage Check

A quick way to check that the reference pages still match the source tree.

## Source tree

- `electron/`: `ai-providers`, `atomic-write`, `bookmarks-store`, `browser-history`, `chat-store`, `document-images`, `file-clipboard`, `fonts`, `i18n`, `images`, `main`, `markdown-embed`, `markdown-images`, `markdown-plain`, `markdown-tokens`, `mcp-bridge`, `mcp-server`, `memory-store`, `menu`, `notes-store`, `path-compare`, `pdf-import`, `preload`, `project-file`, `project-icon`, `project-links`, `project-owner`, `project-pack`, `project-references`, `project-tools`, `projects`, `skills-store`, `updates`.
- `src/`: `App.jsx`, `appearance.js`, `main.jsx`, `styles.css`, `hooks/useDocumentFileCommands.js`, `i18n/index.js` (and the five locale files), and the helpers in `src/lib/`.
- `src/lib/`: `aiOptions`, `aiTools`, `alertExtension`, `anchoring`, `annotationExtension`, `bookmarkExtension`, `bookmarkLinks`, `chatAttachments`, `documentStats`, `editorInsert`, `embeddedImages`, `fonts`, `footnoteExtensions`, `imageExtension`, `imagePaths`, `inlineDiff`, `keepSelectionExtension`, `layout`, `lineDiff`, `listItemExtension`, `markdownSyntax`, `markExtensions`, `mathExtensions`, `mcpRequests`, `pathCompare`, `pendingChangesExtension`, `preferences`, `projectIcons`, `quickActions`, `rawMarkdownExtensions`, `readerMode`, `searchExtension`, `skills`, `smartDashesExtension`, `textAlignExtension`, `updateSchedule`.
- `src/components/`: one page per component, listed in [components.md](components.md).

## Not documented

- `src/app.js`: an empty placeholder file.
- `src/assets/provider-logos/`: the SVG logos of the AI providers, used as images.

## Checks

- Every page has an H1 equal to the module path and a `Source:` line linking the physical file.
- Every page listed in `docs/INDEX.md` exists, and every existing page is listed there.
- `docs/reference/src/lib/lib.md` and `docs/reference/src/components/components.md` list the same pages as `docs/INDEX.md`.
