# Technical Documentation

OpenWriter is a desktop Markdown editor with an integrated AI writing assistant.

Every source file has its own reference page under [`docs/reference/`](reference/). The Project Structure section below lists all the documentation pages in their real directory hierarchy, each linked to its physical page; every entry also links the physical source file it documents.

## Technology Stack

The project is built with Electron, React, Vite, Tailwind CSS, and Tiptap.

## Editor Features

- Rich-text editing with Markdown as the native format: H1–H7 headings, bold, italic, strikethrough, inline code, links, bullet and numbered lists, blockquotes, code blocks, horizontal rules, and undo/redo.
- Opens `.md`, `.markdown`, `.mdown`, `.docx`, and `.pdf` files.
- Markdown files are saved to their original path; DOCX and PDF files are imported as new documents and saved as Markdown.
- Exports to DOCX and PDF.
- Find and replace with live highlighting, a match counter, match-case, whole-word and regular-expression options, and `$1` capture groups in replacements.
- Replace all is handled as a single undoable operation.

## Projects and Tabs

A project corresponds to a working directory. The file explorer displays folders and documents, while AI CLIs run from the project directory.

Tabs support multiple documents at the same time, with independent undo history, scroll position, and unsaved-change indicators.

Side panels are resizable and their dimensions are remembered. Side tabs switch between the file explorer, heading outline, and history for the active document.

The context menu can open, rename, move to the trash, and reveal files and folders in the file manager. Drag and drop copies documents into the project without overwriting existing files.

The session is restored per project, including open tabs, the active document, unsaved drafts, the selected side tab, and expanded folders. The window position and size are also remembered.

## Project Settings and History

When a folder is opened, an `.ow` directory is created or reused at the project root:

```text
.ow/
  project.json
  context.md
  chat/
    attachments/
  notes/
  history/
    chapters/intro.md/
      index.json
      <id>.md
```

The directory contains settings, assistant context, conversations, attachments, notes, and document versions. Its contents are plain text and can be committed to Git or ignored.

A version is saved when the text changes. Manually labeled versions can also be created. Up to 100 versions are retained per document, with older automatic versions removed first.

History can compare a version with the current text, restore it, or delete it. Before a restore, the current text is archived so the operation remains reversible.

## AI Assistant

The assistant is available in a side panel and can work on the current selection or the entire document.

Quick actions include proofreading, rewriting, summarizing, and reviewing. Conversations are saved in the project and can be renamed, deleted, or branched.

Responses are streamed and may include the model's reasoning or progress state. The tool-chain limit is configurable in Settings.

### Tools

- Reading project file listings and document contents; the `.ow`, `.git`, and `node_modules` directories are never exposed.
- Reading the current editor content for open files, including unsaved changes.
- Creating directories and new Markdown or text files without overwriting existing files.
- Moving and deleting project files through the app's controlled project operations.
- Creating notes anchored to text and suggestions with accept/rejectable replacements.
- Inserting and replacing text in the open document through the editor, with undo support through `Ctrl+Z`.
- Optional web browsing through DuckDuckGo and reading open browser tabs.
- Taking document or browser screenshots and reading images for vision-capable models.
- Asking single-choice or multiple-choice questions and sequential questionnaires.

### Supported Providers

CLI providers run without API keys from the environment; authentication is handled through OAuth. OpenWriter instructs them not to run shell commands or modify files outside the app's controlled project operations.

Ollama, Ollama Cloud, Codex, and Claude are supported.

## Spell Checking

The editor and chat input underline spelling errors and offer suggestions in the context menu. Words can be added to the dictionary, and languages can be selected in General Settings with project-level overrides.

## Appearance

System, light, and dark themes are available, together with five accent colors and settings for font, size, line spacing, and text width, with a live preview.

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
  - [preload.cjs.md](reference/electron/preload.cjs.md) ([preload.cjs](../electron/preload.cjs)) — Secure bridge exposed as window.electronAPI
  - [ai-providers.cjs.md](reference/electron/ai-providers.cjs.md) ([ai-providers.cjs](../electron/ai-providers.cjs)) — AI provider connection layer
  - [project-file.cjs.md](reference/electron/project-file.cjs.md) ([project-file.cjs](../electron/project-file.cjs)) — `.ow` directory and document history
  - [chat-store.cjs.md](reference/electron/chat-store.cjs.md) ([chat-store.cjs](../electron/chat-store.cjs)) — Conversations and attachments
  - [notes-store.cjs.md](reference/electron/notes-store.cjs.md) ([notes-store.cjs](../electron/notes-store.cjs)) — Anchored notes and suggestions
  - [project-tools.cjs.md](reference/electron/project-tools.cjs.md) ([project-tools.cjs](../electron/project-tools.cjs)) — File tools for the assistant
  - [images.cjs.md](reference/electron/images.cjs.md) ([images.cjs](../electron/images.cjs)) — Image downloads, screenshots, normalization
  - [menu.cjs.md](reference/electron/menu.cjs.md) ([menu.cjs](../electron/menu.cjs)) — Native application menu
  - [projects.cjs.md](reference/electron/projects.cjs.md) ([projects.cjs](../electron/projects.cjs)) — Recently opened projects
  - [i18n.cjs.md](reference/electron/i18n.cjs.md) ([i18n.cjs](../electron/i18n.cjs)) — Main-process translations
- [docs/reference/src/](reference/src/)
  - [App.jsx.md](reference/src/App.jsx.md) ([App.jsx](../src/App.jsx)) — Workspace state, tabs, panels, session persistence
  - [main.jsx.md](reference/src/main.jsx.md) ([main.jsx](../src/main.jsx)) — React entry point
  - [appearance.js.md](reference/src/appearance.js.md) ([appearance.js](../src/appearance.js)) — Theme, colors, editor preferences
  - [styles.css.md](reference/src/styles.css.md) ([styles.css](../src/styles.css)) — Global stylesheet
  - [hooks.md](reference/src/hooks.md) ([useDocumentFileCommands.js](../src/hooks/useDocumentFileCommands.js)) — Document and file commands hook
  - [i18n/](reference/src/i18n/i18n.md)
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
    - [anchoring.js.md](reference/src/lib/anchoring.js.md) ([anchoring.js](../src/lib/anchoring.js)) — Text anchoring for notes
    - [annotationExtension.js.md](reference/src/lib/annotationExtension.js.md) ([annotationExtension.js](../src/lib/annotationExtension.js)) — Find highlights and note markers
    - [imageExtension.js.md](reference/src/lib/imageExtension.js.md) ([imageExtension.js](../src/lib/imageExtension.js)) — Tiptap image node
    - [imagePaths.js.md](reference/src/lib/imagePaths.js.md) ([imagePaths.js](../src/lib/imagePaths.js)) — Document-relative image paths
    - [layout.js.md](reference/src/lib/layout.js.md) ([layout.js](../src/lib/layout.js)) — Panel widths and persistence
    - [lineDiff.js.md](reference/src/lib/lineDiff.js.md) ([lineDiff.js](../src/lib/lineDiff.js)) — Line-level diff
    - [searchExtension.js.md](reference/src/lib/searchExtension.js.md) ([searchExtension.js](../src/lib/searchExtension.js)) — Find and replace engine
  - [components/](reference/src/components/)
    - [components.md](reference/src/components/components.md) — Index of all components
    - [pages/](reference/src/components/pages/)
      - [ActivityBar.jsx.md](reference/src/components/pages/ActivityBar.jsx.md) ([ActivityBar.jsx](../src/components/ActivityBar.jsx)) — Side rail switching explorer, outline, notes, history, assistant
      - [AiChatPanel.jsx.md](reference/src/components/pages/AiChatPanel.jsx.md) ([AiChatPanel.jsx](../src/components/AiChatPanel.jsx)) — Assistant chat: threads, streaming, tool loop
      - [AiProviderSettings.jsx.md](reference/src/components/pages/AiProviderSettings.jsx.md) ([AiProviderSettings.jsx](../src/components/AiProviderSettings.jsx)) — Provider selection, models, keys, login
      - [AppearanceSettings.jsx.md](reference/src/components/pages/AppearanceSettings.jsx.md) ([AppearanceSettings.jsx](../src/components/AppearanceSettings.jsx)) — Theme, accent colors, typography
      - [BrowserPane.jsx.md](reference/src/components/pages/BrowserPane.jsx.md) ([BrowserPane.jsx](../src/components/BrowserPane.jsx)) — Sandboxed webview tab
      - [ContextMenu.jsx.md](reference/src/components/pages/ContextMenu.jsx.md) ([ContextMenu.jsx](../src/components/ContextMenu.jsx)) — Custom context menus
      - [DocumentPane.jsx.md](reference/src/components/pages/DocumentPane.jsx.md) ([DocumentPane.jsx](../src/components/DocumentPane.jsx)) — Tiptap editor surface per document
      - [DocumentToolbar.jsx.md](reference/src/components/pages/DocumentToolbar.jsx.md) ([DocumentToolbar.jsx](../src/components/DocumentToolbar.jsx)) — Formatting toolbar
      - [FileExplorer.jsx.md](reference/src/components/pages/FileExplorer.jsx.md) ([FileExplorer.jsx](../src/components/FileExplorer.jsx)) — Project tree, rename, delete, import
      - [FindBar.jsx.md](reference/src/components/pages/FindBar.jsx.md) ([FindBar.jsx](../src/components/FindBar.jsx)) — Find and replace with regex and counters
      - [GeneralSettings.jsx.md](reference/src/components/pages/GeneralSettings.jsx.md) ([GeneralSettings.jsx](../src/components/GeneralSettings.jsx)) — Language, spell checking, AI tool toggles
      - [HistoryPanel.jsx.md](reference/src/components/pages/HistoryPanel.jsx.md) ([HistoryPanel.jsx](../src/components/HistoryPanel.jsx)) — Version list, diff, restore, delete
      - [MarkdownMessage.jsx.md](reference/src/components/pages/MarkdownMessage.jsx.md) ([MarkdownMessage.jsx](../src/components/MarkdownMessage.jsx)) — Markdown renderer for assistant messages
      - [MemoryPanel.jsx.md](reference/src/components/pages/MemoryPanel.jsx.md) ([MemoryPanel.jsx](../src/components/MemoryPanel.jsx)) — Assistant memory entries management
      - [NotesPanel.jsx.md](reference/src/components/pages/NotesPanel.jsx.md) ([NotesPanel.jsx](../src/components/NotesPanel.jsx)) — Anchored notes with accept/reject
      - [OutlinePanel.jsx.md](reference/src/components/pages/OutlinePanel.jsx.md) ([OutlinePanel.jsx](../src/components/OutlinePanel.jsx)) — Heading outline navigation
      - [PanelResizer.jsx.md](reference/src/components/pages/PanelResizer.jsx.md) ([PanelResizer.jsx](../src/components/PanelResizer.jsx)) — Draggable panel dividers
      - [ProjectSettings.jsx.md](reference/src/components/pages/ProjectSettings.jsx.md) ([ProjectSettings.jsx](../src/components/ProjectSettings.jsx)) — Project name, AI languages, context
      - [ProjectsPanel.jsx.md](reference/src/components/pages/ProjectsPanel.jsx.md) ([ProjectsPanel.jsx](../src/components/ProjectsPanel.jsx)) — Projects home: open, create, remove
      - [SettingsScreen.jsx.md](reference/src/components/pages/SettingsScreen.jsx.md) ([SettingsScreen.jsx](../src/components/SettingsScreen.jsx)) — Settings container with all sections
      - [SpellcheckLanguages.jsx.md](reference/src/components/pages/SpellcheckLanguages.jsx.md) ([SpellcheckLanguages.jsx](../src/components/SpellcheckLanguages.jsx)) — Spell-check language selection
      - [TabBar.jsx.md](reference/src/components/pages/TabBar.jsx.md) ([TabBar.jsx](../src/components/TabBar.jsx)) — Document and browser tabs
      - [ToolbarButton.jsx.md](reference/src/components/pages/ToolbarButton.jsx.md) ([ToolbarButton.jsx](../src/components/ToolbarButton.jsx)) — Shared toolbar button
      - [VersionDiffDialog.jsx.md](reference/src/components/pages/VersionDiffDialog.jsx.md) ([VersionDiffDialog.jsx](../src/components/VersionDiffDialog.jsx)) — Line-level version diff dialog

## Source tree with reference links

The source files themselves, linked to their documentation pages:

### electron

### src

### src/hooks

### src/lib

### src/i18n

### src/components

One reference page per component under `docs/reference/src/components/pages/`:

### src/assets

## Privacy and Data

Settings, sessions, window state, and the encrypted Ollama Cloud key are stored in Electron's user data directory.

Document text is sent only to the enabled AI provider when a message is submitted. With local Ollama, data does not leave the computer.

## Releases

Pushing a tag such as `v0.2.0` starts the GitHub Actions `Build Desktop App` workflow. The workflow updates the version in `package.json`, creates the Windows installer, Linux AppImage, and macOS DMG, and attaches them to a GitHub Release.

The workflow can also be started manually by choosing a patch, minor, or major version bump.

To create packages locally:

```bash
npm run dist:desktop
npm run dist:mac
npm run dist:linux
```

## Archive Verification

Every reference page was checked against its source file. Findings and fixes applied during the verification:

- Pages rewritten from the actual source (behavior, limits, operations): `electron/images.cjs` (SSRF checks, redirects, normalization limits), `electron/menu.cjs` (exact command list), `electron/projects.cjs` (projects.json layout, missing flag), `electron/i18n.cjs` (shared English-key catalogs), `electron/preload.cjs` (full API surface including memory and AI login), `electron/project-file.cjs`, `electron/project-tools.cjs`, `electron/chat-store.cjs`, `electron/notes-store.cjs` (exact limits and operation sets).
- Renderer pages rewritten against the code: `src/App.jsx` (tool bridge, notes, layout, screenshots), `src/main.jsx` (StrictMode, imports, `initLanguage`), `src/hooks` (full command list), `src/appearance.js` (exact option sets), `src/styles.css` (variable and decoration classes), `src/i18n` (t/tp, pseudo locale, reload flow), `lib/aiOptions.js` (provider-specific reasoning levels), `lib/aiTools.js` (complete tool catalog and protocol helpers), `lib/anchoring.js`, `lib/annotationExtension.js`, `lib/imageExtension.js`, `lib/imagePaths.js`, `lib/layout.js` (exact panel ranges), `lib/lineDiff.js`, `lib/searchExtension.js`.
- Component pages spot-verified and corrected where content had drifted: `OutlinePanel`, `ToolbarButton`, `DocumentToolbar` (H1–H7 included), `TabBar`.
- `components.md` index links fixed to `pages/` (the earlier relative links pointed to the index folder itself).

