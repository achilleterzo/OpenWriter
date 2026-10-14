# Technical Documentation

OpenWriter is a desktop Markdown editor with an integrated AI writing assistant.

Documented source files have reference pages under [`docs/reference/`](reference/). The Project Structure section lists the documentation pages in their real directory hierarchy and links each page to the physical source file it documents.

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

The session is restored per project, including open tabs, unsaved drafts, the active document, expanded folders, and panel state.

## Project Settings and History

When a folder is opened, an `.ow` directory is created or reused at the project root:

```text
.ow/
  project.json
  context.md
  memory.json
  chat/
    attachments/
  notes/
  history/
    chapters/intro.md/
      index.json
      <id>.md
```

The directory contains settings, assistant context, project memory, conversations, attachments, notes, and document versions. Its contents are plain text or JSON and can be committed to Git or ignored.

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

Ollama, Ollama Cloud, OpenRouter, Codex, and Claude are supported.

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
  - [preload.cjs.md](reference/electron/preload.cjs.md) ([preload.cjs](../electron/preload.cjs)) — Secure bridge exposed as `window.electronAPI`
  - [ai-providers.cjs.md](reference/electron/ai-providers.cjs.md) ([ai-providers.cjs](../electron/ai-providers.cjs)) — AI provider connection layer
  - [project-file.cjs.md](reference/electron/project-file.cjs.md) ([project-file.cjs](../electron/project-file.cjs)) — `.ow` directory and document history
  - [chat-store.cjs.md](reference/electron/chat-store.cjs.md) ([chat-store.cjs](../electron/chat-store.cjs)) — Conversations and attachments
  - [notes-store.cjs.md](reference/electron/notes-store.cjs.md) ([notes-store.cjs](../electron/notes-store.cjs)) — Anchored notes and suggestions
  - [memory-store.cjs.md](reference/electron/memory-store.cjs.md) ([memory-store.cjs](../electron/memory-store.cjs)) — Project memory entries and file references
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
      - Each component page under `docs/reference/src/components/pages/` documents the corresponding React component.

## Privacy and Data

Settings, sessions, window state, and the encrypted Ollama Cloud and OpenRouter keys are stored in Electron's user data directory.

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

Reference pages were checked against their source files. The archive includes pages for the Electron stores, renderer modules, libraries, and React components listed above. `memory-store.cjs` is documented in [memory-store.cjs.md](reference/electron/memory-store.cjs.md).

The source tree also contains `src/app.js` and provider-logo assets, which currently have no dedicated reference pages and are therefore not listed as documented modules.