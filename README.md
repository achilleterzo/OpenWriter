# OpenWriter

OpenWriter is a desktop Markdown editor with a built-in AI writing assistant. Open a folder as a project, work on several documents in IDE-style tabs, and chat with an AI provider of your choice to proofread, rewrite, summarize or review your text.

Built with Electron, React, Vite, Tailwind CSS and [Tiptap](https://tiptap.dev).

## Features

### Editor

- Rich-text editing with Markdown as the native format: headings (H1–H7), bold, italic, strikethrough, inline code, links, bullet and numbered lists, blockquotes, code blocks, horizontal rules, undo/redo.
- Opens `.md`, `.markdown`, `.mdown`, `.docx` and `.pdf` files. Markdown files are saved back in place; DOCX and PDF are imported as new documents and saved as Markdown.
- Exports to **DOCX** and **PDF**.

### Projects and tabs

- **Project = working directory.** Open any folder as the project. The file explorer shows its folders and documents, and the AI CLIs run from it.
- **Multiple documents** in tabs at the top, each with its own editor, undo history and scroll position. A dot marks unsaved changes.
- **Side tabs** switch the left panel between the file explorer (default), a heading outline and the version history of the active document.
- **Context menu** on files and folders: open, rename (also `F2`), move to the trash (also `Del`), reveal in the file manager. Open tabs and version history follow a rename.
- **Drag and drop** documents from your system onto the explorer to copy them into the project or into a specific folder. Existing files are never overwritten (`name (1).md`).
- **Session restore per project:** open tabs, the active tab, unsaved drafts, the selected side tab and expanded folders come back after a restart or reload. The window position and size are remembered too.

### Project settings and version history (`.ow`)

Opening a folder as a project creates (or reuses) a `.ow` directory at its root, and marks it hidden on Windows. Anything already inside it is kept and used:

```
.ow/
  project.json      Project name, reply language, options
  context.md        Context for the AI assistant (audience, tone, glossary, style rules…)
  chat/             One JSON file per AI conversation (log, branches, extra context)
  history/          One folder per document, mirroring the project tree
    chapters/intro.md/
      index.json    Version metadata (time, label, automatic or manual)
      <id>.md       The saved text of each version
```

- **Context for the AI:** edit it in **Settings → Project** (or directly in `context.md`). It is sent to the assistant with every conversation.
- **Conversations:** every chat with the assistant is a readable JSON file in `.ow/chat/`, so it doubles as a log. You can branch a conversation from any message, attach earlier conversations as context for a new one, rename or delete them.
- **Versions:** a version is saved on every save when the text changed, and you can save labeled ones by hand from the **History** side tab. Up to 100 per document; the oldest automatic ones are dropped first.
- **History tab:** compare any version against the current text with a line diff, restore it (the current text is archived first, so a restore is always reversible) or delete it.
- Everything is plain text, so `.ow` can be committed to Git or synced along with the project, or ignored if you prefer.

### AI assistant

A right-hand panel (toggle it from the icon at the end of the tab bar) provides a chat with the configured provider:

- Works on your current selection, or on the whole active document as context.
- Quick actions: proofread, rewrite, summarize, review.
- Conversations are saved with the project (`.ow/chat/`): switch between them, **branch** from any message, and attach previous conversations as context.
- Insert a reply into the document (replacing the selection) or copy it.
- Per-provider model and reasoning level, and a configurable reply language.

Supported providers:

| Provider | How it connects |
| --- | --- |
| **Ollama** | Local HTTP service (default `http://localhost:11434`) |
| **Ollama Cloud** | Hosted API with an API key, stored encrypted with Electron `safeStorage` |
| **Codex** | The `codex` CLI, authenticated with your ChatGPT account (OAuth) |
| **Claude** | The `claude` CLI, authenticated with your Claude account (OAuth) |

CLI providers are run in read-only mode and never receive API keys from your environment: authentication is OAuth only. Install the CLI you want to use and sign in from **Settings → AI**.

### Spell checking

The editor and the chat input underline misspellings and offer suggestions in the context menu, with *Add to dictionary*. Choose the languages in **Settings → General**, and optionally override them per project in **Settings → Project** (stored in `.ow/project.json`).

### Appearance

**Settings → Appearance** offers a system, dark or light theme, five accent colors, and editor font, size, line spacing and text width, with a live preview.

## Getting started

Requirements: [Node.js](https://nodejs.org) (current LTS or newer) and npm.

```bash
npm install
npm run dev
```

`npm run dev` starts the Vite dev server and opens the Electron window. Changes in `src/` hot-reload; changes in `electron/` require restarting the command.

To run a production build:

```bash
npm run build
npm start
```

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + N` | New document |
| `Ctrl/Cmd + O` | Open a file |
| `Ctrl/Cmd + Shift + O` | Open a project folder |
| `Ctrl/Cmd + S` | Save |
| `Ctrl/Cmd + Shift + S` | Save as |
| `Ctrl/Cmd + W` | Close the current tab |
| `Ctrl/Cmd + ,` | Settings |

## Project structure

```
electron/
  main.cjs           Window, menus' IPC, documents, projects, sessions
  preload.cjs        Safe bridge exposed to the renderer as window.electronAPI
  ai-providers.cjs   Ollama / Ollama Cloud / Codex / Claude connection layer
  project-file.cjs   The .ow directory: project settings, AI context, version history
  menu.cjs           Native application menu
src/
  App.jsx            Workspace state: tabs, panels, session persistence
  appearance.js      Theme, accent and editor display preferences
  components/        Editor, tab bar, file explorer, outline, AI chat, settings
```

## Data and privacy

OpenWriter keeps its settings, sessions, window state and the encrypted Ollama Cloud key in the Electron user data folder. Document text is only sent to the AI provider you enable, when you send a message. With Ollama (local) nothing leaves your machine.
