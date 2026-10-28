# Documentation Coverage Check

A quick way to check that the reference pages still match the source tree.

## Source tree

- `electron/`: `ai-providers`, `atomic-write`, `bookmarks-store`, `browser-history`, `chat-store`, `document-images`, `file-clipboard`, `fonts`, `i18n`, `images`, `main`, `markdown-embed`, `markdown-images`, `markdown-plain`, `markdown-tokens`, `mcp-bridge`, `mcp-http`, `mcp-server`, `memory-store`, `menu`, `notes-store`, `path-compare`, `pdf-import`, `preload`, `project-file`, `project-icon`, `project-links`, `project-owner`, `project-pack`, `project-references`, `project-search`, `project-tools`, `projects`, `skills-store`, `updates`.
- `src/`: `App.jsx`, `appearance.js`, `main.jsx`, `styles.css`, `hooks/useDocumentFileCommands.js`, `i18n/index.js` (and the five locale files), and the helpers in `src/lib/`.
- `src/lib/`: `aiOptions`, `aiTools`, `alertExtension`, `anchoring`, `annotationExtension`, `bookmarkExtension`, `bookmarkLinks`, `chatAttachments`, `documentStats`, `editorInsert`, `embeddedImages`, `fonts`, `footnoteExtensions`, `imageExtension`, `imagePaths`, `inlineDiff`, `keepSelectionExtension`, `layout`, `lineDiff`, `listItemExtension`, `markdownSyntax`, `markExtensions`, `mathExtensions`, `mcpRequests`, `pathCompare`, `pendingChangesExtension`, `preferences`, `projectIcons`, `quickActions`, `rawMarkdownExtensions`, `readerMode`, `researchAgent`, `searchExtension`, `selectionText`, `skills`, `smartDashesExtension`, `textAlignExtension`, `updateSchedule`.
- `src/components/`: one page per component, listed in [components.md](components.md).

## Not documented

- `src/app.js`: an empty placeholder file.
- `src/assets/provider-logos/`: the SVG logos of the AI providers, used as images.

## Last review of the pages

The pages were read against the source again after the latest changes, so they now also describe:

- the HTTP transport of the MCP server, started by the application and configured from the settings ([mcp-http.cjs.md](electron/mcp-http.cjs.md), [main.cjs.md](electron/main.cjs.md), [preload.cjs.md](electron/preload.cjs.md), [McpSettings.jsx.md](src/components/pages/McpSettings.jsx.md));
- the MCP tools `open_document`, `open_project` (with `create`), `ask_agent` (signed with the agent's name, answering with chat id and message index), `list_chats` and `read_chat`, `list_documents` recursive by default and `read_project` as its alias ([mcp-server.cjs.md](electron/mcp-server.cjs.md)), the tools allowed through the bridge ([mcp-bridge.cjs.md](electron/mcp-bridge.cjs.md)) and their execution in the app ([mcpRequests.js.md](src/lib/mcpRequests.js.md), [App.jsx.md](src/App.jsx.md));
- `list_directory` recursive by default and the `describe_image` / `view_image` pair with its saved descriptions in `.ow/image-descriptions/`, flagged as `described` in the folder listing ([aiTools.js.md](src/lib/aiTools.js.md), [main.cjs.md](electron/main.cjs.md));
- the attachments of a conversation named after the SHA-256 of their content, the clean-up of the orphan ones, and the `source: 'mcp'` / `agent` mark of requests that come from an external agent ([chat-store.cjs.md](electron/chat-store.cjs.md));
- the passages a conversation discusses instead of the whole document, and the selection sent to the assistant ([AiChatPanel.jsx.md](src/components/pages/AiChatPanel.jsx.md), [selectionText.js.md](src/lib/selectionText.js.md));
- the aligned paragraph that holds nothing but a linked image ([textAlignExtension.js.md](src/lib/textAlignExtension.js.md));
- the research assistant, the second model the assistant calls as the `research` tool, with its own settings, its reading-only loop and its report ([researchAgent.js.md](src/lib/researchAgent.js.md), [aiTools.js.md](src/lib/aiTools.js.md), [AiChatPanel.jsx.md](src/components/pages/AiChatPanel.jsx.md), [AiProviderSettings.jsx.md](src/components/pages/AiProviderSettings.jsx.md), [ai-providers.cjs.md](electron/ai-providers.cjs.md));
- the shared text search moved to [project-search.cjs.md](electron/project-search.cjs.md) (literal or regular, `output=files`/`lines`/`count`, globs, a worker with a deadline) and used by the assistant and by the MCP server's `search_files`, with the unsaved editor text searched instead of the file through `dirty_documents` ([project-tools.cjs.md](electron/project-tools.cjs.md), [mcp-server.cjs.md](electron/mcp-server.cjs.md), [mcp-bridge.cjs.md](electron/mcp-bridge.cjs.md), [mcpRequests.js.md](src/lib/mcpRequests.js.md), [App.jsx.md](src/App.jsx.md));
- the project quick actions, stored in `project.json` and shown in the chat before the general ones ([quickActions.js.md](src/lib/quickActions.js.md), [QuickActionsSettings.jsx.md](src/components/pages/QuickActionsSettings.jsx.md), [project-file.cjs.md](electron/project-file.cjs.md), [preload.cjs.md](electron/preload.cjs.md));
- the `toolReasoning` option of the assistant steps.

## Checks

- Every page has an H1 equal to the module path and a `Source:` line linking the physical file. The number of `../` steps must match the depth of the page in `docs/reference/`: `../../../` from `electron/` and `src/`, `../../../../` from `src/lib/` and `src/i18n/`, `../../../../../` from `src/components/pages/` and `src/i18n/locales/`.
- Every page listed in `docs/INDEX.md` exists, and every existing page is listed there.
- `docs/reference/src/lib/lib.md` and `docs/reference/src/components/components.md` list the same pages as `docs/INDEX.md`.

