# Technical Documentation

OpenWriter is a desktop Markdown editor with an integrated AI writing assistant.

Documented source files have reference pages under [`docs/reference/`](reference/). The Project Structure section lists the documentation pages in their real directory hierarchy and links each page to the physical source file it documents.

## Technology Stack

The project is built with Electron, React, Vite, Tailwind CSS, and Tiptap.

## Editor Features

- Rich-text editing with Markdown as the native format: H1–H7 headings, bold, italic, strikethrough, inline code, links, bullet, numbered and task lists, blockquotes, code blocks, tables, horizontal rules, and undo/redo.
- Text alignment (left, centre, right, justified) saved as GitHub-compatible `<div align>` blocks ([textAlignExtension.js](reference/src/lib/textAlignExtension.js.md)).
- Extended Markdown kept exactly as written: GitHub alerts (`[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`), footnotes (`[^1]`), LaTeX formulas (`$…$`, `$$…$$`), front matter, block and inline HTML ([rawMarkdownExtensions.js](reference/src/lib/rawMarkdownExtensions.js.md), [footnoteExtensions.js](reference/src/lib/footnoteExtensions.js.md), [mathExtensions.js](reference/src/lib/mathExtensions.js.md)).
- Typographic rules while typing: `--` becomes «–», `–-` becomes «—», `...` becomes «…», never at the start of a line and never inside code ([smartDashesExtension.js](reference/src/lib/smartDashesExtension.js.md)).
- Safe serialisation of the marks: spaces at the edges of bold or italic text no longer break the delimiters and leave literal asterisks in the file ([markExtensions.js](reference/src/lib/markExtensions.js.md)).
- A floating bar on the selection for the marks, links (Ctrl+K, also on images) and image details: alt text, title, link, replace, remove ([SelectionToolbar.jsx](reference/src/components/pages/SelectionToolbar.jsx.md)).
- Marks along the side of the document show the assistant edits still to review and the open notes ([ChangeMarkers.jsx](reference/src/components/pages/ChangeMarkers.jsx.md)).
- An AI-likelihood check of the current text, with a score, a confidence and a rationale shown next to the toolbar button.
- Opens `.md`, `.markdown`, `.mdown`, `.docx`, `.pdf`, and project images.
- Markdown files are saved to their original path; DOCX and PDF files are imported as new documents and saved as Markdown. In a PDF the images stay where they were on the page ([pdf-import.cjs](reference/electron/pdf-import.cjs.md)).
- Exports to DOCX and PDF, and a self-contained Markdown export with the images embedded as `data:` URIs ([markdown-embed.cjs](reference/electron/markdown-embed.cjs.md)).
- Find and replace with live highlighting, a match counter, match-case, whole-word and regular-expression options, and `$1` capture groups in replacements.
- Replace all is handled as a single undoable operation.
- Images of a document (in its `images/` folder) follow it when it is moved, and a shared image is copied instead ([document-images.cjs](reference/electron/document-images.cjs.md)).
- Editor fonts: a bundled set of Google Fonts plus the ones installed from the catalog, kept in the application data so they also work offline ([fonts.js](reference/src/lib/fonts.js.md), [fonts.cjs](reference/electron/fonts.cjs.md)).
- Files can be copied or cut in OpenWriter and pasted in the system file manager, and the other way round ([file-clipboard.cjs](reference/electron/file-clipboard.cjs.md)).

## Projects and Tabs

A project corresponds to a working directory. The file explorer displays folders and documents, while AI CLIs run from the project directory.

Tabs support multiple documents at the same time, with independent undo history, scroll position, and unsaved-change indicators.

Side panels are resizable and their dimensions are remembered. The rail on the left switches between the projects list, the file explorer, the heading outline, the notes, the bookmarks, the history, and the project memory ([ActivityBar.jsx](reference/src/components/pages/ActivityBar.jsx.md)).

A tab opened by a single click is a preview and is replaced by the next file, until the user works on it or double-clicks to keep it. Many modified documents can be saved at once from the tab bar.

The context menu can open, rename, move to the trash, and reveal files and folders in the file manager. Drag and drop copies documents into the project without overwriting existing files.

The session is restored per project, including open tabs, unsaved drafts, the active document, expanded folders, and panel state.

A folder with its own `.ow` directory is a sub-project: the nearest `.ow` owns the history, the notes and the bookmarks of a document ([project-owner.cjs](reference/electron/project-owner.cjs.md)). A project can also link Markdown files that live elsewhere, without copying them ([project-links.cjs](reference/electron/project-links.cjs.md)), point at reference folders outside it that the assistant may only read ([project-references.cjs](reference/electron/project-references.cjs.md)), and choose an icon that travels with the project ([project-icon.cjs](reference/electron/project-icon.cjs.md)).

Bookmarks are named anchors in a document: they can be linked as `file.md#name`, and a flagged one is a point the user wants the assistant to look at ([bookmarks-store.cjs](reference/electron/bookmarks-store.cjs.md)). The setup of a project — context, instruction files, skills and settings — can be exported to a single file and applied to another project ([project-pack.cjs](reference/electron/project-pack.cjs.md)).

## Project Settings and History

When a folder is opened, an `.ow` directory is created or reused at the project root:

```text
.ow/
  
```

  project.json
  context.md
  links.json
  references.json
  icon.png
  skills/
  memory.json
  chat/
    attachments/
  notes/
  bookmarks/
  browser-history.json
  history/
    chapters/intro.md/
      index.json
      <id>.md

```

The directory contains settings, the assistant context, the linked documents and reference folders, the project icon, project memory, conversations, attachments, notes, bookmarks, the browser history, and document versions. Its contents are plain text or JSON and can be committed to Git or ignored, and every write is atomic ([atomic-write.cjs](reference/electron/atomic-write.cjs.md)).
```

A version is saved when the text changes. Manually labeled versions can also be created. Up to 100 versions are retained per document, with older automatic versions removed first.

History can compare a version with the current text, restore it, or delete it. Before a restore, the current text is archived so the operation remains reversible.

## AI Assistant

The assistant is available in a side panel and can work on the current selection or the entire document.

Quick actions (proofread, rewrite, summarize, lengthen, review) can be edited in Settings, and you can add your own; by default Review leaves its remarks as notes in the document. Conversations are saved in the project and can be renamed, deleted, or branched.

Responses are streamed and may include the model's reasoning or progress state. Token usage is shown per reply and per conversation. The tool-chain limit is configurable in Settings, together with the option to continue on its own when the limit is reached.

### Writing Skills

A writing skill is a reusable pack of style, tone of voice, rules, reference examples and quick actions, stored as a Markdown file. The global library lives in the user data directory (Settings → Skills); a project can have its own skills in `.ow/skills/`, which take precedence over global ones with the same id. The project settings choose the skills active by default, and each conversation can add or remove skills from the chat. Skills can be generated by the AI from a sample text or from the current conversation and reviewed before saving.

### Tools

- Reading project file listings and document contents; the `.ow`, `.git`, and `node_modules` directories are never exposed.
- Reading the current editor content for open files, including unsaved changes.
- Creating directories and new Markdown or text files without overwriting existing files.
- Moving and deleting project files through the app's controlled project operations.
- Creating notes anchored to text and suggestions with accept/rejectable replacements.
- Setting bookmarks: named anchors in a document, linkable as `file.md#name`, with a flag and a note to point a passage out.
- Inserting and replacing text in the open document through the editor, with undo support through `Ctrl+Z`.
- Optional web browsing through DuckDuckGo and reading open browser tabs.
- Taking document or browser screenshots and reading images for vision-capable models.
- Asking single-choice or multiple-choice questions and sequential questionnaires.

### Supported Providers

CLI providers run without API keys from the environment; authentication is handled through OAuth. OpenWriter instructs them not to run shell commands or modify files outside the app's controlled project operations.

Ollama, Ollama Cloud, OpenRouter, Codex, Claude, and Gemini are supported. Ollama Cloud, OpenRouter, and Gemini use an API key kept in the operating system's encrypted credential storage; the CLI providers authenticate through OAuth.

### External Agents (MCP)

OpenWriter also exposes its project to external agents as an MCP server on stdio: they can read the context, the instructions, the skills, the notes, the bookmarks and the memory, and search and read the documents, but never edit a text — they can only leave notes, suggested changes and bookmarks for review ([mcp-server.cjs](reference/electron/mcp-server.cjs.md), configured from Settings → Agents (MCP), [McpSettings.jsx](reference/src/components/pages/McpSettings.jsx.md)).

## Spell Checking

The editor and chat input underline spelling errors and offer suggestions in the context menu. Words can be added to the dictionary, and languages can be selected in General Settings with project-level overrides.

## Appearance

System, light, and dark themes are available, together with six accent colors (ash, violet, cyan, emerald, rose, amber) and settings for font, size, line spacing, and text width, with a live preview. The editor font is a system typeface or one of the Google Fonts bundled with the application or installed from the catalog ([FontPicker.jsx](reference/src/components/pages/FontPicker.jsx.md)); a project can override it. Preferences are stored in the application data, so they no longer depend on the page address or the installation folder ([preferences.js](reference/src/lib/preferences.js.md)).

## Local Development

Requirements: the current or a later Node.js LTS version and npm.

```bash
npm install
npm run dev
```

`npm run dev` starts the Vite server and opens the Electron window. Changes in `src/` reload automatically; changes in `electron/` require restarting the command.

For a production build:

```bash
npm run build
npm start
```

## Project Structure

Documentation pages under `docs/reference/`, in their real directory hierarchy. Each entry links to its documentation page and, in parentheses, to the physical source file it documents.

- [docs/reference/electron/](reference/electron/)
  - [main.cjs.md](reference/electron/main.cjs.md) ([main.cjs](../electron/main.cjs)) — Window, menus, IPC, documents, projects, sessions
  - [preload.cjs.md](reference/electron/preload.cjs.md) ([preload.cjs](../electron/preload.cjs)) — Secure bridge exposed as `window.electronAPI`
  - [atomic-write.cjs.md](reference/electron/atomic-write.cjs.md) ([atomic-write.cjs](../electron/atomic-write.cjs)) — Atomic writes with retries
  - [ai-providers.cjs.md](reference/electron/ai-providers.cjs.md) ([ai-providers.cjs](../electron/ai-providers.cjs)) — AI provider connection layer
  - [project-file.cjs.md](reference/electron/project-file.cjs.md) ([project-file.cjs](../electron/project-file.cjs)) — `.ow` directory and document history
  - [project-owner.cjs.md](reference/electron/project-owner.cjs.md) ([project-owner.cjs](../electron/project-owner.cjs)) — Nearest `.ow` rule, sub-projects, loose documents
  - [project-links.cjs.md](reference/electron/project-links.cjs.md) ([project-links.cjs](../electron/project-links.cjs)) — Markdown files linked from outside the project
  - [project-icon.cjs.md](reference/electron/project-icon.cjs.md) ([project-icon.cjs](../electron/project-icon.cjs)) — Project icon: reading, validating, saving
  - [project-references.cjs.md](reference/electron/project-references.cjs.md) ([project-references.cjs](../electron/project-references.cjs)) — Read-only reference folders outside the project
  - [project-pack.cjs.md](reference/electron/project-pack.cjs.md) ([project-pack.cjs](../electron/project-pack.cjs)) — Shareable project setup: context, instructions, skills
  - [chat-store.cjs.md](reference/electron/chat-store.cjs.md) ([chat-store.cjs](../electron/chat-store.cjs)) — Conversations and attachments
  - [notes-store.cjs.md](reference/electron/notes-store.cjs.md) ([notes-store.cjs](../electron/notes-store.cjs)) — Anchored notes and suggestions
  - [bookmarks-store.cjs.md](reference/electron/bookmarks-store.cjs.md) ([bookmarks-store.cjs](../electron/bookmarks-store.cjs)) — Named anchors in documents, linkable as `file.md#name`
  - [memory-store.cjs.md](reference/electron/memory-store.cjs.md) ([memory-store.cjs](../electron/memory-store.cjs)) — Project memory entries and file references
  - [skills-store.cjs.md](reference/electron/skills-store.cjs.md) ([skills-store.cjs](../electron/skills-store.cjs)) — Writing skills: global and project libraries
  - [project-tools.cjs.md](reference/electron/project-tools.cjs.md) ([project-tools.cjs](../electron/project-tools.cjs)) — File tools for the assistant
  - [markdown-plain.cjs.md](reference/electron/markdown-plain.cjs.md) ([markdown-plain.cjs](../electron/markdown-plain.cjs)) — Plain text of a document, for anchoring quotations
  - [markdown-embed.cjs.md](reference/electron/markdown-embed.cjs.md) ([markdown-embed.cjs](../electron/markdown-embed.cjs)) — Self-contained Markdown export with embedded images
  - [document-images.cjs.md](reference/electron/document-images.cjs.md) ([document-images.cjs](../electron/document-images.cjs)) — Images following a document that is moved
  - [pdf-import.cjs.md](reference/electron/pdf-import.cjs.md) ([pdf-import.cjs](../electron/pdf-import.cjs)) — PDF text extraction with the images in place
  - [fonts.cjs.md](reference/electron/fonts.cjs.md) ([fonts.cjs](../electron/fonts.cjs)) — Google Fonts downloaded and kept in the app data
  - [file-clipboard.cjs.md](reference/electron/file-clipboard.cjs.md) ([file-clipboard.cjs](../electron/file-clipboard.cjs)) — Files copied and cut through the system clipboard
  - [browser-history.cjs.md](reference/electron/browser-history.cjs.md) ([browser-history.cjs](../electron/browser-history.cjs)) — History of the built-in browser, per project
  - [images.cjs.md](reference/electron/images.cjs.md) ([images.cjs](../electron/images.cjs)) — Image downloads, screenshots, normalization
  - [mcp-server.cjs.md](reference/electron/mcp-server.cjs.md) ([mcp-server.cjs](../electron/mcp-server.cjs)) — MCP server for external agents
  - [menu.cjs.md](reference/electron/menu.cjs.md) ([menu.cjs](../electron/menu.cjs)) — Native application menu
  - [updates.cjs.md](reference/electron/updates.cjs.md) ([updates.cjs](../electron/updates.cjs)) — Latest version from the GitHub releases
  - [projects.cjs.md](reference/electron/projects.cjs.md) ([projects.cjs](../electron/projects.cjs)) — Recently opened projects
  - [i18n.cjs.md](reference/electron/i18n.cjs.md) ([i18n.cjs](../electron/i18n.cjs)) — Main-process translations
- [docs/reference/src/](reference/src/)
  - [App.jsx.md](reference/src/App.jsx.md) ([App.jsx](../src/App.jsx)) — Workspace state, tabs, panels, session persistence
  - [main.jsx.md](reference/src/main.jsx.md) ([main.jsx](../src/main.jsx)) — React entry point
  - [appearance.js.md](reference/src/appearance.js.md) ([appearance.js](../src/appearance.js)) — Theme, colors, editor preferences
  - [styles.css.md](reference/src/styles.css.md) ([styles.css](../src/styles.css)) — Global stylesheet
  - [hooks.md](reference/src/hooks.md) ([useDocumentFileCommands.js](../src/hooks/useDocumentFileCommands.js)) — Document and file commands hook
  - [i18n/](reference/src/i18n/)
    - [i18n.md](reference/src/i18n/i18n.md) ([index.js](../src/i18n/index.js)) — Translation runtime index
    - [locales/](reference/src/i18n/locales/)
      - [de.json.md](reference/src/i18n/locales/de.json.md) ([de.json](../src/i18n/locales/de.json)) — German strings
      - [es.json.md](reference/src/i18n/locales/es.json.md) ([es.json](../src/i18n/locales/es.json)) — Spanish strings
      - [fr.json.md](reference/src/i18n/locales/fr.json.md) ([fr.json](../src/i18n/locales/fr.json)) — French strings
      - [it.json.md](reference/src/i18n/locales/it.json.md) ([it.json](../src/i18n/locales/it.json)) — Italian strings
      - [pt.json.md](reference/src/i18n/locales/pt.json.md) ([pt.json](../src/i18n/locales/pt.json)) — Portuguese strings
  - [lib/](reference/src/lib/)
    - [lib.md](reference/src/lib/lib.md) — Index of the `src/lib` helpers
    - [aiOptions.js.md](reference/src/lib/aiOptions.js.md) ([aiOptions.js](../src/lib/aiOptions.js)) — Provider option helpers
    - [aiTools.js.md](reference/src/lib/aiTools.js.md) ([aiTools.js](../src/lib/aiTools.js)) — Tool catalog and execution layer
    - [alertExtension.js.md](reference/src/lib/alertExtension.js.md) ([alertExtension.js](../src/lib/alertExtension.js)) — GitHub alerts (`[!NOTE]`…) in blockquotes
    - [anchoring.js.md](reference/src/lib/anchoring.js.md) ([anchoring.js](../src/lib/anchoring.js)) — Text anchoring for notes
    - [annotationExtension.js.md](reference/src/lib/annotationExtension.js.md) ([annotationExtension.js](../src/lib/annotationExtension.js)) — Find highlights and note markers
    - [bookmarkExtension.js.md](reference/src/lib/bookmarkExtension.js.md) ([bookmarkExtension.js](../src/lib/bookmarkExtension.js)) — Bookmarks drawn in the text
    - [bookmarkLinks.js.md](reference/src/lib/bookmarkLinks.js.md) ([bookmarkLinks.js](../src/lib/bookmarkLinks.js)) — Links to bookmarks and headings
    - [chatAttachments.js.md](reference/src/lib/chatAttachments.js.md) ([chatAttachments.js](../src/lib/chatAttachments.js)) — Chat attachments and token usage
    - [editorInsert.js.md](reference/src/lib/editorInsert.js.md) ([editorInsert.js](../src/lib/editorInsert.js)) — Markdown inserted into the editor in place of a range
    - [embeddedImages.js.md](reference/src/lib/embeddedImages.js.md) ([embeddedImages.js](../src/lib/embeddedImages.js)) — Embedded base64 images collapsed for display
    - [fonts.js.md](reference/src/lib/fonts.js.md) ([fonts.js](../src/lib/fonts.js)) — Editor fonts and the Google Fonts catalog
    - [footnoteExtensions.js.md](reference/src/lib/footnoteExtensions.js.md) ([footnoteExtensions.js](../src/lib/footnoteExtensions.js)) — Footnote references and definitions
    - [imageExtension.js.md](reference/src/lib/imageExtension.js.md) ([imageExtension.js](../src/lib/imageExtension.js)) — Tiptap image node, also inside a link
    - [imagePaths.js.md](reference/src/lib/imagePaths.js.md) ([imagePaths.js](../src/lib/imagePaths.js)) — Document-relative image paths and link resolution
    - [inlineDiff.js.md](reference/src/lib/inlineDiff.js.md) ([inlineDiff.js](../src/lib/inlineDiff.js)) — Word-level differences for the review
    - [keepSelectionExtension.js.md](reference/src/lib/keepSelectionExtension.js.md) ([keepSelectionExtension.js](../src/lib/keepSelectionExtension.js)) — Selection kept visible without focus
    - [layout.js.md](reference/src/lib/layout.js.md) ([layout.js](../src/lib/layout.js)) — Panel widths and persistence
    - [lineDiff.js.md](reference/src/lib/lineDiff.js.md) ([lineDiff.js](../src/lib/lineDiff.js)) — Line-level diff
    - [listItemExtension.js.md](reference/src/lib/listItemExtension.js.md) ([listItemExtension.js](../src/lib/listItemExtension.js)) — List items indented by their marker
    - [markExtensions.js.md](reference/src/lib/markExtensions.js.md) ([markExtensions.js](../src/lib/markExtensions.js)) — Safe writing of the Markdown marks
    - [mathExtensions.js.md](reference/src/lib/mathExtensions.js.md) ([mathExtensions.js](../src/lib/mathExtensions.js)) — LaTeX formulas kept as written
    - [pendingChangesExtension.js.md](reference/src/lib/pendingChangesExtension.js.md) ([pendingChangesExtension.js](../src/lib/pendingChangesExtension.js)) — Assistant edits marked for review
    - [preferences.js.md](reference/src/lib/preferences.js.md) ([preferences.js](../src/lib/preferences.js)) — Interface preferences in the app data
    - [projectIcons.js.md](reference/src/lib/projectIcons.js.md) ([projectIcons.js](../src/lib/projectIcons.js)) — Project icons: reading, caching, choosing
    - [quickActions.js.md](reference/src/lib/quickActions.js.md) ([quickActions.js](../src/lib/quickActions.js)) — Chat quick actions and their defaults
    - [rawMarkdownExtensions.js.md](reference/src/lib/rawMarkdownExtensions.js.md) ([rawMarkdownExtensions.js](../src/lib/rawMarkdownExtensions.js)) — Front matter and HTML kept as raw text
    - [readerMode.js.md](reference/src/lib/readerMode.js.md) ([readerMode.js](../src/lib/readerMode.js)) — Article extraction, reading view, save as Markdown
    - [searchExtension.js.md](reference/src/lib/searchExtension.js.md) ([searchExtension.js](../src/lib/searchExtension.js)) — Find and replace engine
    - [skills.js.md](reference/src/lib/skills.js.md) ([skills.js](../src/lib/skills.js)) — Writing skills helpers
    - [smartDashesExtension.js.md](reference/src/lib/smartDashesExtension.js.md) ([smartDashesExtension.js](../src/lib/smartDashesExtension.js)) — Dashes and ellipsis typed in the editor
    - [textAlignExtension.js.md](reference/src/lib/textAlignExtension.js.md) ([textAlignExtension.js](../src/lib/textAlignExtension.js)) — Text alignment saved as aligned blocks
    - [updateSchedule.js.md](reference/src/lib/updateSchedule.js.md) ([updateSchedule.js](../src/lib/updateSchedule.js)) — When the app checks for a new version
  - [components/](reference/src/components/)
    - [components.md](reference/src/components/components.md) — Index of all components
    - [pages/](reference/src/components/pages/) — One page per component, named after its file; each page links to the component it documents.

## Privacy and Data

Settings, sessions, window state, the interface preferences, the installed fonts, the last version checked for updates, and the encrypted Ollama Cloud, OpenRouter, and Gemini API keys are stored in Electron's user data directory.

Document text is sent only to the enabled AI provider when a message is submitted. With local Ollama, data does not leave the computer.

Web browsing by the assistant is off by default; when it is on, the searches and the addresses go through DuckDuckGo and the pages, while the sites the user opens in a browser tab are visited as usual. The built-in browser keeps a history per project, the assistant's navigations in a separate one ([browser-history.cjs](reference/electron/browser-history.cjs.md)). The MCP server only reads the project and leaves notes, suggestions and bookmarks; a read-only mode removes even that ([mcp-server.cjs](reference/electron/mcp-server.cjs.md)).

## Releases

Pushing a tag such as `v0.2.0` starts the GitHub Actions `Build Desktop App` workflow. The workflow updates the version in `package.json`, creates the Windows installer, Linux AppImage, and macOS DMG, and attaches them to a GitHub Release.

The workflow can also be started manually by choosing a patch, minor, or major version bump.

To create packages locally:

```bash
npm run dist:desktop
npm run dist:mac
npm run dist:linux
```

## Documentation Coverage

Every documented module of the source tree is listed above with a reference page under `docs/reference/`, in its real directory hierarchy. A compact list of the modules and of the checks is in [coverage.md](reference/coverage.md).

- The Electron main-process modules (`electron/`), each with its own page.
- The renderer modules and helpers (`src/App.jsx`, `src/main.jsx`, `src/appearance.js`, `src/styles.css`, `src/hooks/`, `src/i18n/`, `src/lib/`).
- The React components (`src/components/`), one page per component, indexed in [components.md](reference/src/components/components.md).

Not documented, and therefore not listed: `src/app.js` (empty placeholder file) and the provider logo assets in `src/assets/provider-logos/`.