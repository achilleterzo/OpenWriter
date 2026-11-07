# OpenWriter

[![XERJ Corpus Hub contributor](https://hub.xerj.org/contributors/achilleterzo/badge.svg)](https://hub.xerj.org/contributors/achilleterzo)

OpenWriter is a local-first writing workspace for Markdown. Your documents, notes, and the knowledge that builds up in your projects stay on your computer, and two kinds of agents can work on them together: the assistant built into the app and the external agents you already use (Claude Code, Codex, OpenCode, the clients in your IDE), connected through a built-in MCP server.

It is made for any long piece of work that has to stay coherent as it grows: a book, a guide, a manual, a thesis, a body of documentation, or a software project and the ideas around it.

Built with Electron, React, Vite, Tailwind CSS, and Tiptap.

## The idea: documents, knowledge, agents

Writing something large is mostly remembering: what you decided, where you already said it, what another piece of work already contains. OpenWriter treats that as part of the tool.

1. **Write down what you decide.** A project is a folder of plain Markdown documents, with its notes, bookmarks, memory, skills, and instructions beside them. Nothing is locked away: it is all readable text.
2. **Make it findable.** Every project can keep a local index of its documents, searched by words and, with a model that runs on your computer, by meaning. Whoever works on the project asks for the passages they need instead of reading whole files: a smaller context, a lighter load on the model, and a more precise use of what you wrote.
3. **Let the agents share it.** The built-in assistant and the external agents read the same project and the same knowledge. They can also look into the projects you choose to share, even if those are not open.

### Two agents in parallel

The external agent and the built-in assistant do not compete: they split the work. While Claude Code (or another agent) writes the code or develops an idea, it can hand the documentation of it to the built-in assistant with `ask_agent`. The assistant works in the app in parallel, with the instructions, skills, and memory of the project, and the agent follows what it writes (`list_chats`, `read_chat`). What either of them changes in the open documents reaches you as an edit to accept or reject. Both look things up with `search_knowledge` as they need, so neither has to carry the whole project around.

### Some ways to use it

- **Software and its documentation.** Ideas and code are written in one place while the documentation follows. Asked to implement something that already exists in another project, an agent finds the right files through the shared knowledge, without that project being open, and can prototype a service across two projects by reading the source of both.
- **A book.** Chapters are documents. Search by meaning finds where a character or a theme was already treated, even in different words; research and discarded drafts can live in a second project that shares its knowledge; saved web pages become sources you can consult offline.
- **A guide or a manual.** The guide draws on the projects it describes, read-only, and an agent checks what it says against what the source actually does.
- **A series or a shared world.** Each volume is a project; sharing keeps names, places, and rules consistent between them.
- **Research and theses.** One project per source or chapter, and the Projects Home shows how the subjects get close to each other.

## Highlights

**Write**
- Edit Markdown in a rich-text interface while Markdown stays the native format, with a source view, find and replace, and extended Markdown (tables, footnotes, formulas, GitHub alerts, front matter, HTML) kept exactly as written.
- Open Markdown, DOCX, and PDF files; export to DOCX, PDF, or a self-contained Markdown file. Open a `.md` file straight from the operating system.
- Organize documents in projects with a file explorer, tabs, outlines, bookmarks, sub-projects, linked documents, and their own icon. Work without a project too, in a built-in main project.
- Customize themes, accent colors, typography, and spell-checking. The interface is available in English, Italian, French, Spanish, German, and Portuguese.

**Find**
- Search by words and by meaning, in a project or across all of them, with a model that runs on your computer and is downloaded only if you ask for it. No text leaves the machine.
- See all your projects at once in the Projects Home: a network of project icons, linked when their contents are close in meaning, with a search that works like an agent's.
- Save web pages into a project as Markdown copies that can be read and searched offline, and refresh them when the page changes.

**Connect**
- Share knowledge between projects on your terms: each project decides whether it is indexed and whether its passages are visible to the others and to the agents.
- Let external agents work on the project through the built-in MCP server; they read its context, notes, documents, and knowledge, and what they change reaches you as edits to accept or reject.

**Delegate and review**
- Use the assistant to proofread, rewrite, summarize, lengthen, review, and edit selected text or complete documents. Quick actions, writing skills, and project memory are all customizable.
- Review every edit before keeping it: changes are applied in place and marked for you to accept or reject, with the history of the document and its conversations kept alongside the project.
- Associate `.md` files with OpenWriter and open any folder as a project from the file manager, where the platform allows it.

The sections below describe each area in detail.

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
- The chat box takes a restricted Markdown (bold, italic, code, lists, links) with no visible toolbar: paste Markdown, start a line with `- ` for a list, and the replies and the assistant's questions are rendered as Markdown too.

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
- Search the ranked passages of the project, of its reference folders, and of the other projects that share their knowledge (`search_knowledge`), by words and, when the local model is installed, by meaning.
- Save a web page into the project as a Markdown copy and refresh it later (`save_web_reference`, `refresh_web_reference`).
- Hand an exploration to the research assistant, a second model that searches and reads the project on its own and returns a short report with paths and line numbers.
- Create directories and new Markdown or text files without overwriting existing files.
- Edit open documents (replace or insert text, or rewrite the whole document), with every change undoable.
- Add, update, and remove anchored notes and suggested replacements.
- Save and recall project memory.
- Move or delete project files through the app's controlled project operations, asking you to confirm deletions.
- Browse the web, read browser tabs, and capture document or browser screenshots. The assistant's browsing never reaches the local or private network: `localhost`, private addresses, link-local and service addresses (IPv4 and IPv6) are refused, also when a public name resolves to one of them or a page redirects to it.
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
- **Search and saved pages.** `search_knowledge` searches the ranked passages (words, and meaning when the model is installed) of the project, its reference folders, the saved web pages, and the other projects that share their knowledge, and with no project at all it still searches the shared ones. `list_web_references` lists the saved pages, and `save_web_reference` and `refresh_web_reference` (writing tools) save or refresh one: the agent browses only public addresses.
- **Handing work over.** `ask_agent` gives a task to the built-in assistant: it starts a chat — a new one unless you say otherwise — and the assistant works on it in the app, in parallel with the agent. The request is signed with the agent's name, so you can tell it from your own messages, and the answer tells the agent which chat and which message it landed in; from there it follows the work with `list_chats` and `read_chat`.
- **Two ways to connect.** Normally stdio, started by the agent's client. For the clients that cannot start a program, an HTTP server can be turned on in Settings → Agents (MCP): the same server, on `127.0.0.1` at a fixed address, so the client configuration does not change, listening only while OpenWriter runs.
- **Switches.** `--read-only` (Settings → Agents (MCP) → Read-only) removes every writing tool. "Let agents change the documents open in OpenWriter" turns the editor edits off at any time, without regenerating the client configuration. The HTTP server has its own switch, its own read-only option, and a token you can renew.

## Projects and data

A project is a working directory. When it is opened, OpenWriter creates or reuses a `.ow` directory containing project settings, assistant context, skills, conversations, attachments, notes, memory, and document history. These files are plain text or JSON and can be committed to Git or added to `.gitignore`.

The projects view lists the known projects with an avatar (the project's icon, or one generated from its name), and a context menu to open, configure, move, reveal, or remove them. A project can have a name of its own in its settings (the field starts with the folder name; the `@` in front is only decoration): the name is used in the lists, the graph, the explorer, and by agents, and the `@alias` of a project in the searches of other projects comes from it.

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

## Projects Home

The Projects tab opens the Home, a full-area view of all your projects that stays open even when the side panel is collapsed.

- **A network of projects.** Each project is a bubble with its icon (animated GIF and WebP icons move), sized and shaded by how much it contains. Projects whose contents are close in meaning are joined by synapses; the others float freely. A project inside the folder of another one is a smaller satellite orbiting its parent. Names show on hover, a right click opens the project menu (open, settings, move, show in the file manager), and you can drag bubbles, pan, and zoom. The graph has its own fixed dark background, whatever the theme.
- **Search like an agent.** The search bar looks through every project at once and shows the passages in a resizable panel, grouped by project, while the bubbles with results light up. Each result says why it is there (it contains the words, only matches by meaning, or both) and carries a relevance factor; passages that do not stand out from the rest are filtered, and "Show less relevant too" brings them back, always ordered by relevance. Opening a result opens its project and document, and the search and results are kept when you come back.
- **Synonyms.** Besides the words you typed, the search also uses the words of your own texts that are closest in meaning (computed locally from the vocabulary of your projects, no model call), and, if the AI is on, the synonyms an AI model suggests (the research model when one is set, which only sees the searched words), cached for recent searches. A switch turns the synonyms off.
- **Always up to date.** The Refresh button rescans the files of every project with the index on, opened or not, and the projects are also updated in the background when you open one.

## Search by meaning and local models

OpenWriter keeps, for every project with the search index on, a derived index of its documents in the application data (`knowledge.db`: full-text search plus, optionally, vectors). It is only a copy: the files are the truth, and it is rebuilt if it is damaged.

Search by meaning needs a model that runs on your computer, `multilingual-e5-small`, which is **not** shipped with the application and is downloaded only when you click the button (Settings → Local models, or the first-run window that offers it once):

- **CPU pack** (about 150 MB): works everywhere.
- **Graphics card pack** (about 280 MB, experimental): much faster, needs WebGPU, and runs in a hidden window of the application.

Each pack lives in the application data (never in a project), has pinned sizes and checksums, and can be removed at any time; each has its own vectors, so switching computes only what is missing. Without a pack everything works as before, by words. The vectors are computed in the background without blocking the interface, and no text leaves the computer.

## Sharing knowledge between projects

Two switches in each project's settings decide what the others see:

- **Search index.** Off, and the project is not indexed at all: it is in no search.
- **Share its knowledge.** On by default. It decides only what *other* projects, their assistants, and external agents can find: they see the passages of the projects that share, as `@name/…` read-only folders, exactly like a reference folder. A project that does not share still has its index, and **your own search in the Home covers it** (marked "Not shared"); only the assistants and agents of other projects do not see it.

Reference folders (folders that are not projects) can also be linked and searched. The Home graph connects the projects that share; one that does not share floats without synapses.

## Saved web pages

The star of the browser tab saves the page into the project as a Markdown copy (`.ow/web/…`, indexed in `.ow/web.json`) with a header that says where it comes from and how old it is. The pages are `@web/…` for the assistant and for agents, are searched with the rest of the knowledge, and can be refreshed: a refresh says whether the page is unchanged, changed (and updates the copy, or only checks), and the pages of shared projects are searchable as `@project-web`. Saved pages are read with the page's scripts run, as you see it.

## Operating system integration

Settings → Associations connects OpenWriter with the operating system, in the way each platform allows:

- **Windows:** offers OpenWriter in "Open with" for `.md`, `.markdown`, and `.mdown` through the user's registry (no administrator rights; Windows does not allow an app to make itself the default, so the page opens the default apps settings and tells you whether OpenWriter is already the default), and adds "Open as OpenWriter project" to the folder menu of File Explorer.
- **Linux:** makes OpenWriter the default app for `text/markdown` with `xdg-mime` (it needs the launcher file of the installed package) and adds the folder entry for Nautilus and Dolphin.
- **macOS:** the document types are declared in the application, so "Open with" works; the default app is chosen in the Finder (Get Info → Open with → Change All…), and the system does not allow an app to add a Finder menu entry.

Nothing is registered in the development version, and where something is not possible the page says why. A folder passed to the application (the file manager entry, the command line, a second launch) opens as a project.

## Browser and reader view

A browser tab lets you search and read web pages without leaving the application, and the assistant can read it when web browsing is enabled. The reading view extracts the article from a page and shows it in a clean layout, with adjustable text size and a light or dark theme. The article can be saved as Markdown, with its title and source, into the project. A screenshot of the content of a tab can be saved in the project's `screenshots` folder. Each project keeps its own history of the addresses you visited, offered as suggestions while you type in the address bar (the assistant's browsing is recorded apart, and available to it through a tool). Tabs and logins survive a restart, and the open pages come back where they were.

## Updates and reliability

The application can check for a new version at a schedule you choose in Settings → About (never by itself replacing anything: you are only notified). Sessions and the data in `.ow` (settings, notes, bookmarks, memory, links) are written atomically, so an interruption never leaves a truncated file. If the interface stops responding, the reason is recorded in `crash.log` in the application data, the window is reloaded, and an oversized unsaved draft that kept the startup from completing is set aside in `recovered-drafts` instead of being lost.

## Privacy

Document text is sent to the selected AI provider only when you submit a request. With a local Ollama model, the text stays on your machine. Ollama Cloud, OpenRouter, and Gemini credentials are stored using Electron's encrypted credential storage. Web browsing by the assistant is off by default, and when on it never reaches the local or private network.

The search index is a local copy of your documents in the application data, and the vectors are computed on your machine. The only things that are downloaded are the local model packs, and only when you click the button: from Hugging Face and the npm registry through jsDelivr, at fixed versions and checked against pinned sizes and SHA-256 hashes. The synonyms suggested by an AI model send only the words you searched, to the model you configured for it. Knowledge sharing is per project: a project that does not share is invisible to the assistants and agents of other projects, although your own Home search can read it. The associations touch only the current user's registry or home folder, never system-wide settings.

External agents are opt-in, and what an agent may read or change is the same the assistant may ([External agents (MCP)](#external-agents-mcp)); what an agent finds in other projects is limited to the ones that share their knowledge. The server runs as a separate process, never writes to the document files, and reaches no path beyond the documents of the project, the ones linked to it, the ones open in OpenWriter, and the chats of the assistant. The bridge, and the HTTP server when you turn it on, listen only on `127.0.0.1` and require a token: `mcp-bridge.json` and `mcp-http.json` in the application data, readable only by your user, the second renewable. The HTTP server also refuses requests that carry an `Origin` header, so a web page cannot reach it. Both can be switched off, or made read-only, which removes every writing tool. The server itself never contacts an AI provider: when an agent hands a task to the built-in assistant, it runs in the app with the provider you configured, like any other request of yours.

## Getting started

Requirements: Node.js current LTS or newer and npm.

```bash
cd openwriter
npm install
npm run dev
```

The development command starts Vite and opens the Electron application. Changes in `src/` reload automatically; changes in `electron/` require restarting the development command. The file associations and the folder entry are not registered in the development version: install a build to try them.

Unit tests run with `npm run test:unit`; `npm test` also runs the production build. Two of the semantic tests run against the real model and are skipped unless `OW_SEMANTIC_PACK` points to an installed pack folder.

To create and run a production build locally:

```bash
npm run build
npm start
```

## Documentation

The technical documentation is available in [`docs/README.md`](docs/README.md). It covers the application architecture, project storage, assistant tools, development workflow, and release process.

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

Issues and pull requests are welcome. The general guidelines — project layout, code conventions, documentation duties, and how to report a bug — are in [CONTRIBUTING.md](CONTRIBUTING.md).

Before opening a pull request, please run:

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