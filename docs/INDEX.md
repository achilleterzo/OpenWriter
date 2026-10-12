# Technical Documentation

OpenWriter is a desktop Markdown editor with an integrated AI writing assistant.

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

- Reading project file listings and document contents; the `.ow` directory is never exposed.
- Reading the current editor content for open files, including unsaved changes.
- Creating notes anchored to text and suggestions with accept/rejectable replacements.
- Inserting and replacing text in the open document through the editor, with undo support through `Ctrl+Z`.
- Optional web browsing through DuckDuckGo and reading open browser tabs.
- Taking document or browser screenshots and reading images for vision-capable models.
- Asking single-choice or multiple-choice questions and sequential questionnaires.

### Supported Providers

CLI providers run in read-only mode and never receive API keys from the environment. Authentication is handled through OAuth.

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

```text
electron/
  main.cjs           Window, menus, IPC, documents, projects, and sessions
  preload.cjs        Secure bridge exposed as window.electronAPI
  ai-providers.cjs   AI provider connection layer
  project-file.cjs   .ow directory and history
  chat-store.cjs     Conversations
  notes-store.cjs    Notes and suggestions
  project-tools.cjs  Read-only tools for the assistant
  images.cjs         Image downloads, screenshots, and normalization
  menu.cjs           Native menu
src/
  App.jsx            Workspace state, tabs, panels, and session persistence
  appearance.js      Theme, colors, and editor preferences
  components/        Editor, tabs, file explorer, outline, chat, and settings
```

## Privacy and Data

Settings, sessions, window state, and the encrypted Ollama Cloud key are stored in Electron's user data directory.

Document text is sent only to the enabled AI provider when a message is submitted. With local Ollama, data does not leave the computer.

## Releases

Pushing a tag such as `v0.2.0` starts the GitHub Actions `Build Desktop App` workflow. The workflow updates the version in `package.json`, creates the Windows installer, Linux AppImage, and macOS dmg, and attaches them to a GitHub Release.

The workflow can also be started manually by choosing a patch, minor, or major version bump.

To create packages locally:

```bash
npm run dist:desktop
npm run dist:mac
npm run dist:linux
```

