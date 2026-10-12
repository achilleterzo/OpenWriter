# OpenWriter

OpenWriter is a desktop Markdown editor with a built-in AI writing assistant. Open a folder as a project, work on several documents in IDE-style tabs, and chat with an AI provider of your choice to proofread, rewrite, summarize or review your text.

Built with Electron, React, Vite, Tailwind CSS and [Tiptap](https://tiptap.dev).

## Features

### Editor

- Rich-text editing with Markdown as the native format: headings (H1–H7), bold, italic, strikethrough, inline code, links, bullet and numbered lists, blockquotes, code blocks, horizontal rules, undo/redo.
- Opens `.md`, `.markdown`, `.mdown`, `.docx` and `.pdf` files. Markdown files are saved back in place; DOCX and PDF are imported as new documents and saved as Markdown.
- Exports to **DOCX** and **PDF**.
- **Find and replace** (`Ctrl/Cmd + F`, or `Ctrl/Cmd + H` to open it with replace; also the magnifier in the toolbar): live highlighting, match counter, next/previous (`Enter` / `Shift+Enter`), match case, whole word and regular expressions (with `$1` capture groups in the replacement). *Replace all* is a single undo step.

### Projects and tabs

- **Project = working directory.** Open any folder as the project. The file explorer shows its folders and documents, and the AI CLIs run from it.
- **Multiple documents** in tabs at the top, each with its own editor, undo history and scroll position. A dot marks unsaved changes.
- **Resizable panels:** drag the edge of the left panel or of the assistant (double-click to reset, or focus the handle and use the arrow keys, `Shift` for bigger steps). Widths have fixed minimums (180 px and 280 px), the document always keeps at least 280 px, and your sizes are remembered. On a narrow window the panels shrink temporarily and return to your sizes when it grows.
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
    attachments/    Images and screenshots the assistant looked at
  notes/            Notes and suggestions anchored to document text (one file per document)
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
- **Streaming:** the reply appears as it is written, with the model's reasoning (or its progress) and a **Stop** button.
- **Tools** (each can be switched off in **Settings → AI**):
  - *Project files:* list a directory and read a file (`.ow` is never exposed). A file that is open in a tab is read **from the editor**, so unsaved changes (yours or the assistant's) are what it sees, never a stale copy from disk.
  - *Notes:* add actionable notes anchored to the text. A note with a proposed replacement is a **suggestion** you can accept (applies it, undoable) or reject; the assistant can query notes and their status to remember what you accepted or declined. Asked to review or reconsider the notes, it can revise **its own** open notes (text and proposed correction, marked *revised*) or reopen/resolve them, and answers your notes by adding new ones; accepting or rejecting is always up to you. Notes live in `.ow/notes/`, so the Markdown stays clean.
  - *Edit the open document:* replace or insert text. Edits go through the editor (undo with `Ctrl+Z`), are not saved automatically, and a version is archived before the first one.
  - *Web browsing (off by default):* search with DuckDuckGo, open pages, and **read the Browser tabs you have open** (it can list them, read the current content of any tab, navigate a tab or open a new one, go back/forward/reload). The tabs are real, so you can watch and use them yourself. The assistant cannot open local or private-network addresses. Note that it can read any page open in those tabs, including ones you are signed in to.
  - *Images and screenshots (for vision models):* take a screenshot of the visible part of the document (with highlights and notes) or of a Browser tab, and look at images found in pages (`<img>` tags and direct links), at any URL, or in project files. Images are stored as attachments in `.ow/chat/attachments/` and shown as thumbnails in the chat (click to enlarge). Only the latest few are re-sent to the model to save tokens. It needs a model with vision: for Ollama the capability is read from the model (`/api/show`); Claude and Codex are assumed to support it. Remote images are downloaded by the app, with local and private-network addresses blocked (including through redirects and DNS).
  - *Questions with choices:* the assistant can ask you a question with clickable options (paged, multi-select when useful, plus an *Other* field for a free answer and *Skip*) and waits for your reply, which comes back to it as the tool result. A short **questionnaire** can be asked in sequence (one question at a time, with *Back* and progress), and a choice can be **ordered** (the numbers show the order you picked, which the assistant receives). Digits `1`–`9` pick an option.
  - *Step limit:* how many tools the assistant may chain per request is set in **Settings → AI** (default 15). At the limit it asks whether to continue instead of just stopping.
- Insert a reply into the document (replacing the selection) or copy it.
- Per-provider model and reasoning level, switchable right from the chat (below the message box) or in Settings, and a configurable reply language.

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
| `Ctrl/Cmd + F` / `Ctrl/Cmd + H` | Find / Find and replace |
| `Ctrl/Cmd + ,` | Settings |

## Project structure

```
electron/
  main.cjs           Window, menus' IPC, documents, projects, sessions
  preload.cjs        Safe bridge exposed to the renderer as window.electronAPI
  ai-providers.cjs   Ollama / Ollama Cloud / Codex / Claude connection layer
  project-file.cjs   The .ow directory: project settings, AI context, version history
  chat-store.cjs     Conversations in .ow/chat
  notes-store.cjs    Notes and suggestions in .ow/notes
  project-tools.cjs  Read-only file tools exposed to the assistant
  images.cjs         Image download (SSRF-safe), screenshots and normalization
  menu.cjs           Native application menu
src/
  App.jsx            Workspace state: tabs, panels, session persistence
  appearance.js      Theme, accent and editor display preferences
  components/        Editor, tab bar, file explorer, outline, AI chat, settings
```

## Data and privacy

OpenWriter keeps its settings, sessions, window state and the encrypted Ollama Cloud key in the Electron user data folder. Document text is only sent to the AI provider you enable, when you send a message. With Ollama (local) nothing leaves your machine.

## Releases

Pushing a tag such as `v0.2.0` runs the **Build Desktop App** workflow (`.github/workflows/build-desktop.yml`): it syncs the version in `package.json` on `main`, builds the Windows installer, the Linux AppImage and the macOS dmg, and attaches them to a GitHub Release. The same workflow can be started manually from the Actions tab, choosing a patch, minor or major bump. To build locally: `npm run dist:desktop` (Windows), `dist:mac` or `dist:linux`.
