# OpenWriter

[![XERJ Corpus Hub contributor](https://hub.xerj.org/contributors/achilleterzo/badge.svg)](https://hub.xerj.org/contributors/achilleterzo)

OpenWriter is a local-first desktop Markdown editor with an AI writing assistant. It provides a focused writing environment, project-based organization, and control over where documents, conversations, notes, and history are stored.

Built with Electron, React, Vite, Tailwind CSS, and Tiptap.

## Highlights

- Edit Markdown documents in a rich-text interface while keeping Markdown as the native format, with a Markdown source view and find and replace.
- Open Markdown, DOCX, and PDF files, and export documents to DOCX or PDF. Open a `.md` file straight from the operating system.
- Organize documents by project with a file explorer, multiple tabs, outlines, and resizable panels. Projects can contain sub-projects, linked documents, and their own icon.
- Work without a project too: documents opened from anywhere keep their conversations, notes, and history in a built-in main project.
- Use an AI assistant to proofread, rewrite, summarize, lengthen, review, and edit selected text or complete documents. Quick actions, writing skills, and project memory are all customizable.
- Review the assistant's edits before keeping them: changes are applied in place and marked for you to accept or reject.
- Keep conversations, notes, project context, attachments, and document history alongside each project.
- Browse the web in a tab, read articles in a clean reading view, and save them as Markdown.
- Customize the editor with themes, accent colors, typography, spell-checking languages, and project-level settings. The interface is available in English, Italian, French, Spanish, German, and Portuguese.
- Write extended Markdown without losing a character: tables, footnotes, formulas, GitHub alerts, front matter, and HTML are kept exactly as written.
- Mark points of a document with bookmarks, link to them from any document (`file.md#name`), and flag the ones you want the assistant to look at.
- Let external agents (Claude Code, Codex, OpenCode, the clients built into your IDE) work on the project through the built-in MCP server: they read its context, notes, and documents, and what they change reaches you as edits to accept or reject.

## Documents and the editor

- Rich-text editing with Markdown as the native format, plus a Markdown source view.
- Find and replace with match counter, match-case, whole-word, and regular-expression options.
- Notes anchored to the text of a document, with accept, reject, and resolve actions. They are stored outside the Markdown file so it stays clean.
- Document history with automatic and manually labelled versions, comparison with the current document, and restore.
- DOCX and PDF files are imported as editable Markdown. In a project, the original file is shown under its Markdown file in the explorer and opens read-only.
- Documents open on the operating system's request (double-click or "Open with"). The installers register the `.md`, `.markdown`, and `.mdown` extensions, and in the installed application a second launch hands its files to the running one.
- Extended Markdown is round-tripped untouched: tables, footnotes (`[^1]`), LaTeX formulas (`$…$`, `$$…$$`), GitHub alerts (`[!NOTE]`, `[!TIP]`…), front matter, and block or inline HTML.
- Text alignment (left, centre, right, justified), saved as GitHub-compatible `<div align>` blocks, and typographic rules while typing (`--` becomes «–», `...` becomes «…», never inside code).
- A floating bar on the selection for bold, italic, strikethrough, code, links (Ctrl+K), and footnotes; for an image it edits the alternative text, the title, and the link, replaces or removes it.
- Bookmarks: named anchors in a document, with their own panel. Link to one from any document as `file.md#name`; a flagged bookmark is a point you want the assistant to look at. Bookmarks, like notes, are stored outside the Markdown file.
- Images open in a viewer tab with wheel zoom, drag to pan (only where the image overflows), fit and actual-size toggles, and arrows or the keyboard to move through the images of the folder. An image can be linked to an address. The images of a document follow it when it is moved, and an image another document still uses is copied instead.
- Export to DOCX or PDF, or to a single self-contained Markdown file with the images embedded. PDFs are imported with their images in place.
- When the assistant edits a passage, the change is shown at word level, so you review what actually changed and not the whole block.
- Editor fonts: a curated set of Google Fonts, more installable from the catalog and kept for offline use, with an optional font per project. The reading mode follows the application theme, and the theme and the language default to the system's.
- The Markdown source view shows line numbers.
- An Info tab with the statistics of the document in front: last save, words, characters, sentences, pages, reading and speaking time, average and longest sentence, structure (headings, lists, tables, images, links, footnotes, formulas), and the numbers of the selected text.
- Many modified documents can be saved at once from the tab bar; a document modified by the assistant counts as modified until you accept its edits.

## AI providers

OpenWriter currently supports:

- Ollama through a configurable local endpoint
- Ollama Cloud through an API key stored in the operating system's encrypted credential storage
- OpenRouter (hundreds of hosted models) through an API key stored the same way
- OpenAI Codex CLI through its OAuth flow
- Claude Code through its OAuth flow
- Gemini through a Google AI Studio API key, using the OpenAI-compatible endpoint

Responses can stream text, reasoning, and status updates. Requests can be cancelled, token usage is shown per reply and per conversation, and the maximum number of chained tool steps is configurable. The model and reasoning effort can be changed from the chat, and the model picker can filter by what a model accepts (images, PDFs).

OpenWriter instructs the CLI providers not to run arbitrary shell commands. Their interaction with the project is mediated through OpenWriter's assistant tools, which can read, create, rewrite, move, and delete project files through controlled operations.

## The AI assistant

- **Quick actions.** The buttons above the message box (Proofread, Rewrite, Summarize, Lengthen, Review) can be edited in Settings: each has a label and a prompt. The default ones can be modified and restored one by one or all at once; you can add your own, and a project can have actions of its own, shown before the general ones. By default Review leaves its remarks as notes in the document.
- **Writing skills.** Reusable style, tone, and rules, stored as Markdown files, globally or per project, with optional reference examples and their own quick actions. A skill can be generated by the assistant from a text or a conversation, or imported from a Markdown file.
- **Project memory.** Lasting information (decisions, terminology, style choices) saved by you or by the assistant, linked to the files it applies to.
- **Research assistant.** An optional second model, chosen in Settings, that the assistant calls to explore the project on its own — searching and reading the files — and that returns a short report with paths and line numbers, so long explorations stay out of the conversation. It only reads.
- **Context and attachments.** Choose which open documents are sent as context. Attach images and PDFs to a message (when the model can read them).
- **Reviewable edits.** Edits made through the assistant's tools stay applied but are marked, with the previous text shown and Accept and Reject buttons. A version is archived before the first edit of a turn.
- **Conversations.** Stored as readable JSON, with renaming, deletion, branching, copied message history, and additional conversation context.
- **Tools you can switch off.** Each group of tools can be turned off in Settings. The assistant is told which ones are off, so it can ask you to turn one on instead of working around it.

## Assistant tools

Depending on the enabled settings, the assistant can:

- List project directories and read text documents, DOCX, PDF, and supported image files.
- Read the current content of documents open in the editor, including unsaved changes.
- Search the project files for words, phrases, or regular expressions — as a list of files, matching lines with context, or totals only.
- Hand an exploration to the research assistant, a second model that searches and reads the project on its own and returns a short report with paths and line numbers.
- Create directories and new Markdown or text files without overwriting existing files.
- Edit open documents (replace or insert text, or rewrite the whole document), with every change undoable.
- Add, update, and remove anchored notes and suggested replacements.
- Save and recall project memory.
- Move or delete project files through the app's controlled project operations, asking you to confirm deletions.
- Browse the web, read browser tabs, and capture document or browser screenshots.
- Use images from the project, downloaded images, and image attachments in conversations.
- Ask single-choice, multiple-choice, and sequential questions.
- Without a project folder open: create a new project from the conversation, after you confirm and choose where it goes.

The `.ow`, `.git`, and `node_modules` directories are excluded from assistant file tools. Read and image operations are size-limited.

## External agents (MCP)

OpenWriter includes a Model Context Protocol server, so that the agents you already use (Claude Code, Codex, OpenCode, the clients built into editors and IDEs) can work with the project the way the built-in assistant does. In Settings → Agents (MCP) you find the configuration to paste into each client; the server runs with the application itself, and it also works with OpenWriter closed (apart from the tools that act in the app: the editor edits, `open_document`, `open_project` and `ask_agent`).

- **Which project.** The one the agent switched to with `open_project`, otherwise the one given with `--project`, otherwise the nearest `.ow` above the folder where the agent starts, otherwise the project open in OpenWriter. The server also knows which document you have in front, and the tools that take a document default to it.
- **What it reads.** The project context and instructions, skills, notes, bookmarks, and memory; the whole file tree in one call (`list_documents` is recursive by default, and `read_project` is its alias); documents (the saved file, or with `read_open_document` what you see right now, unsaved changes included); and a text search (`search_files`, which with the app running searches the unsaved text of the documents open in the editor instead of the older files on disk). It can also read the chats of the built-in assistant under `.ow/chat` — `list_chats` for the newest, `read_chat` for the last messages of one with their tool calls summarised — so it can follow, and check, what `ask_agent` set in motion.
- **What it can reach.** The documents of the project, the documents linked to it, and the documents open in OpenWriter, also outside the project folder. Any other path on the disk is refused.
- **What it writes.** Notes, suggested changes (a note with a replacement), and bookmarks, stored in `.ow`; new documents and folders (never overwriting anything); and, with the application running, edits to the documents open in the editor (`replace_text`, `insert_text`, `replace_document`). Those edits are applied to the live editor through a local bridge: they are marked for you to accept or reject, can be undone, and nothing reaches the file until you save.
- **What it opens, in the app.** `open_document` brings a document in front in a tab — one of the project, or any document file outside it: opening it is what makes it part of the active workspace. `open_project` opens a project folder and switches the application to it, with `create=true` to create a new project there first (the parent folder must exist, the folder must be missing or empty). With OpenWriter closed, `create=true` still creates the folder on disk, but nothing switches: the server keeps working on the project it already had.
- **Handing work over.** `ask_agent` gives a task to the built-in assistant: it starts a chat — a new one unless you say otherwise — and the assistant works on it in the app, in parallel with the agent. The request is signed with the agent's name, so you can tell it from your own messages, and the answer tells the agent which chat and which message it landed in; from there it follows the work with `list_chats` and `read_chat`.
- **Two ways to connect.** Normally stdio, started by the agent's client. For the clients that cannot start a program, an HTTP server can be turned on in Settings → Agents (MCP): the same server, on `127.0.0.1` at a fixed address, so the client configuration does not change, listening only while OpenWriter runs.
- **Switches.** `--read-only` (Settings → Agents (MCP) → Read-only) removes every writing tool. "Let agents change the documents open in OpenWriter" turns the editor edits off at any time, without regenerating the client configuration. The HTTP server has its own switch, its own read-only option, and a token you can renew.

## Projects and data

A project is a working directory. When it is opened, OpenWriter creates or reuses a `.ow` directory containing project settings, assistant context, skills, conversations, attachments, notes, memory, and document history. These files are plain text or JSON and can be committed to Git or added to `.gitignore`.

The projects view lists the known projects with an avatar (the project's icon, or one generated from its name), and a context menu to open, configure, move, reveal, or remove them.

### File explorer

- Move through the tree with the arrow keys, Home, and End; Enter opens a file, F2 renames, Del deletes. Dropping on a folder moves, from outside the project it copies.
- **Selection.** Ctrl/Cmd+click adds or removes a row, Shift+click (or Shift+arrows) selects a range, Ctrl/Cmd+A selects everything visible. Dragging, the context menu, copy, cut, and delete all act on the whole selection, with a single confirmation.
- **Folders** work like files: they can be dragged inside the tree, dropped from the file manager (copied with their content), copied, cut, and pasted.
- **System clipboard.** Copy or cut in OpenWriter and paste in the file manager or another program, and the other way round. Dragging also hands files and folders to the system.
- **DOCX and PDF originals.** A converted document keeps its original under it; deleting the document moves the original to the trash with it, and renaming or moving the document carries the original along.
- Changes made by other programs (a file pasted, created, moved, or deleted) appear in the tree by themselves.
- Confirmations (delete, move) use the application's own dialogs, not the system's.

### Sharing a project's setup

The context, instruction files, skills, and settings of a project (not the history, conversations, or notes) can be exported to a single file and applied to another project, as a standard way of working on shared projects.

### Project icon

In the project settings, click the avatar to choose an image: PNG, JPG, GIF, WebP, BMP, ICO, AVIF, or SVG. Raster images are resized and stored as `.ow/icon.png`; SVG, and animated GIF or WebP images up to 1 MB, are kept as they are. The icon travels with the project.

### Sub-projects

A folder that contains its own `.ow` directory is a sub-project (created on request from the file explorer's context menu, and shown with its own icon). As with Git, the nearest `.ow` owns a document's history and notes, so they stay with the sub-project whether you work on it from the parent project or open it as a project of its own. Dragging a document into or out of a sub-project in the file explorer moves its history, notes and memory entries along with it. The assistant receives the instructions of every project enclosing the active document (the nearest one prevailing), unless the sub-project turns inheritance off.

A sub-project can be made standalone by moving it out of the project, and a standalone project can be moved in as a sub-project, from the file explorer's context menu. The whole folder moves, with its `.ow`.

### Moving a project

From the projects view (context menu) or the project settings, a project can be moved to another folder. The project list and the saved sessions follow it, and the open project stays open in its new place.

### Linked documents

A project can link Markdown files that live elsewhere, without copying them. Linked documents appear in their own section of the explorer, open and save at their original location, and can be unlinked or pointed to a different file if the original was moved. When the assistant creates a project from a conversation, the documents involved are linked, not copied.

### The main project

When no project is open, OpenWriter uses a built-in main project, stored in a `main` folder with its own `.ow` inside the application data directory. It holds the conversations, notes, memory, instructions, and skills of that mode, and it always keeps the history and notes of documents opened from outside the current project. In this mode the assistant works on the documents open in tabs, identified by their full paths.

### Conversations and history

Conversations are stored as readable JSON files and support renaming, deletion, branching, copied message history, and additional conversation context. Image and PDF attachments are stored separately and referenced from the conversation log.

Document history supports automatic and manually labelled versions, comparison with the current document, restore, and deletion. Up to 100 versions are retained per document, with older automatic versions removed first.

## Browser and reader view

A browser tab lets you search and read web pages without leaving the application, and the assistant can read it when web browsing is enabled. The reading view extracts the article from a page and shows it in a clean layout, with adjustable text size and a light or dark theme. The article can be saved as Markdown, with its title and source, into the project. A screenshot of the content of a tab can be saved in the project's `screenshots` folder. Each project keeps its own history of the addresses you visited, offered as suggestions while you type in the address bar (the assistant's browsing is recorded apart, and available to it through a tool). Tabs and logins survive a restart, and the open pages come back where they were.

## Updates and reliability

The application can check for a new version at a schedule you choose in Settings → About (never by itself replacing anything: you are only notified). Sessions and the data in `.ow` (settings, notes, bookmarks, memory, links) are written atomically, so an interruption never leaves a truncated file. If the interface stops responding, the reason is recorded in `crash.log` in the application data, the window is reloaded, and an oversized unsaved draft that kept the startup from completing is set aside in `recovered-drafts` instead of being lost.

## Privacy

Document text is sent to the selected AI provider only when you submit a request. With a local Ollama model, the text stays on your machine. Ollama Cloud, OpenRouter, and Gemini credentials are stored using Electron's encrypted credential storage. Web browsing by the assistant is off by default.

External agents are opt-in, and what an agent may read or change is the same the assistant may ([External agents (MCP)](#external-agents-mcp)). The server runs as a separate process, never writes to the document files, and reaches no path beyond the documents of the project, the ones linked to it, the ones open in OpenWriter, and the chats of the assistant. The bridge, and the HTTP server when you turn it on, listen only on `127.0.0.1` and require a token: `mcp-bridge.json` and `mcp-http.json` in the application data, readable only by your user, the second renewable. The HTTP server also refuses requests that carry an `Origin` header, so a web page cannot reach it. Both can be switched off, or made read-only, which removes every writing tool. The server itself never contacts an AI provider: when an agent hands a task to the built-in assistant, it runs in the app with the provider you configured, like any other request of yours.

## Getting started

Requirements: Node.js current LTS or newer and npm.

```bash
cd openwriter
npm install
npm run dev
```

The development command starts Vite and opens the Electron application. Changes in `src/` reload automatically; changes in `electron/` require restarting the development command.

To create and run a production build locally:

```bash
npm run build
npm start
```

## Documentation

The technical documentation is available in [`docs/INDEX.md`](docs/INDEX.md). It covers the application architecture, project storage, assistant tools, development workflow, and release process.

All the project documentation in `docs/` was produced with OpenWriter itself, using its editor and AI assistant.

## Building installers

```bash
npm run dist:desktop  # Windows
npm run dist:mac      # macOS
npm run dist:linux    # Linux
```

## Automated releases

The `Build Desktop App` GitHub Actions workflow runs when a `v*` tag is pushed or manually from the Actions interface.

It updates the package version when needed, runs linting and tests, builds Windows NSIS, Linux AppImage, and macOS DMG packages, and publishes them as GitHub Release assets. Manual releases support patch, minor, and major version bumps.

## Contributing

Issues and pull requests are welcome. Before opening a pull request, please run:

```bash
npm run lint
npm test
```

Please keep changes focused and include a clear description of the user-facing behavior they affect.

## License

OpenWriter is released under the MIT License. See [LICENSE](LICENSE) for the full license terms.

## Support

If you find this project useful and want to support its development:

[Buy me a coffee](https://buymeacoffee.com/achilleterb)