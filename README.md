# OpenWriter

**English** · [Italiano](README.it.md) · [Español](README.es.md) · [Français](README.fr.md) · [Deutsch](README.de.md) · [Português](README.pt.md)

[![XERJ Corpus Hub contributor](https://hub.xerj.org/contributors/achilleterzo/badge.svg)](https://hub.xerj.org/contributors/achilleterzo)

OpenWriter is a local-first writing workspace for Markdown. Your documents, notes, and the knowledge that builds up in your projects stay on your computer, and two kinds of agents can work on them together: the assistant built into the app and the external agents you already use, connected through a built-in MCP server.

It is made for any long piece of work that has to stay coherent as it grows: a book, a guide, a manual, a thesis, a body of documentation, or a software project and the ideas around it.

Built with Electron, React, Vite, Tailwind CSS, and Tiptap.

## The idea: documents, knowledge, agents

Writing something large is mostly remembering: what you decided, where you already said it, what another piece of work already contains. OpenWriter treats that as part of the tool.

1. **Write down what you decide.** A project is a folder of plain Markdown documents, with its notes, bookmarks, memory, skills, and instructions beside them. Nothing is locked away: it is all readable text.
2. **Make it findable.** Every project can keep a local index of its documents, searched by words and, with a model that runs on your computer, by meaning. Whoever works on the project asks for the passages they need instead of reading whole files: a smaller context, a lighter load on the model, and a more precise use of what you wrote.
3. **Let the agents share it.** The built-in assistant and the external agents read the same project and the same knowledge. They can also look into the projects you choose to share, even if those are not open.

### Two agents in parallel

OpenWriter contains a Model Context Protocol (MCP) server. It is the standard through which the agents you already use — Claude Code, Codex, OpenCode, the clients built into editors and IDEs — can work on a folder of files. You paste a configuration snippet into the client (Settings → Agents (MCP)). From then on, that agent can read the project, its knowledge, its notes, and its saved pages, and change its documents. It is the agent you already pay for and trust, put to work on your Markdown.

That agent and the built-in assistant do not compete: they split the work. While Claude Code writes the code or develops an idea, it can hand the documentation of it over to the assistant with a single call, `ask_agent`. The assistant starts a chat in the app and works on it in parallel, with the instructions, skills, and memory of the project. The agent does not have to write that text with its own context. It then follows what it wrote by reading that chat: `list_chats` finds it, and `read_chat` returns its last messages. The request is signed with the agent's name, so it is told apart from your own. What either of them changes in the open documents reaches you as an edit to accept or reject. Both look things up with `search_knowledge` as they need, so neither has to carry the whole project around.

### Some ways to use it

- **Software and its documentation.** Ideas and code are written in one place while the documentation follows. Asked to implement something that already exists in another project, an agent finds the right files through the shared knowledge, without that project being open.
- **A book or a series.** Chapters are documents; search by meaning finds where a character or a theme was already treated, and each volume can be a project that shares its knowledge to keep names, places, and rules consistent.
- **A guide or a manual.** The guide draws on the projects it describes, read-only, and an agent checks what it says against what the source actually does.
- **Research and theses.** One project per source or chapter, and the Projects Home shows how the subjects get close to each other.

## What it does

**Write.** Rich-text editing with Markdown as the native format, a source view, find and replace, notes and bookmarks, document history, DOCX and PDF import, export to DOCX, PDF, or a self-contained Markdown file, and a text reader for any other text file. → [Documents and the editor](docs/guide/documents-and-editor.md)

**Delegate and review.** An assistant that proofreads, rewrites, summarizes, and edits, with quick actions, writing skills, project memory, and several AI providers (Ollama, Ollama Cloud, OpenRouter, Codex, Claude, Gemini). Quick actions are yours to edit, and a project can have its own, imported in one go from another project. Every edit is applied in place and marked for you to accept or reject — or, for a project where you choose so, accepted and saved at the end of the work. The writing temperature and how much the assistant may do are set per project, and an interrupted turn can be resumed from its last step. → [The assistant](docs/guide/assistant.md)

**Find.** Search by words and by meaning, in a project or across all of them, with a model that runs on your computer and is downloaded only if you ask for it; a whole-words switch turns it into an exact search when you want a name, an expression, or a quotation as it stands. When the computer has more than one graphics card, you choose which one the search by meaning uses. Pages from the web can be saved into a project and searched offline. → [Knowledge](docs/guide/knowledge.md)

**See everything at once.** The Projects Home is a network of all your projects, linked when their contents are close in meaning, with a search that works like an agent's. → [Projects Home](docs/guide/projects-home.md)

**Organize.** Projects with a file explorer, sub-projects, linked documents, and their own icon; workspaces that filter which projects you, the assistant, and the agents see. → [Projects](docs/guide/projects.md) · [Workspaces](docs/guide/workspaces.md)

**Connect.** Each project decides whether it is indexed and whether its passages are visible to the others. External agents work on the project through the built-in MCP server, and what they change reaches you as edits to accept or reject. → [External agents (MCP)](docs/guide/external-agents.md)

**Integrate.** File associations and the folder entry of the file manager, a built-in browser with a reader view, updates on your schedule. → [The application and the system](docs/guide/system.md)

The interface is available in English, Italian, French, Spanish, German, and Portuguese, with themes, accent colors, and typography you can change.

## Privacy

No account and no configuration are needed to start: the editor, the projects, the notes and the search by words work on their own, and document text reaches an AI provider only when you set one up and submit a request — with a local Ollama model it never leaves your machine. The search index and its vectors live on your computer; the only downloads are the local model packs, and only when you click the button. The meaning model runs on the CPU or, if you prefer, on a graphics card you pick among the ones the computer has. External agents are opt-in, reach only the documents of the project, and listen only on `127.0.0.1` with a token. The details are in [Privacy](docs/guide/privacy.md).

## Getting started

OpenWriter runs on Windows (installer), macOS (DMG), and Linux (AppImage, DEB). Ready-made builds are on the [releases page](https://github.com/achilleterzo/OpenWriter/releases); building it yourself takes the steps below.

Requirements: Node.js 22 or newer and npm. Run the commands below in the folder where you cloned the repository, whatever you called it:

```bash
npm install
npm run dev
```

The development command starts Vite and opens the Electron application. Changes in `src/` reload automatically; changes in `electron/` require restarting the development command. The file associations and the folder entry are not registered in the development version: install a build to try them.

Unit tests run with `npm run test:unit`; `npm test` also runs the production build. A few of the semantic tests run against the real model and are skipped unless `OW_SEMANTIC_PACK` points to an installed pack folder.

To create and run a production build locally:

```bash
npm run build
npm start
```

## Documentation

- [Technical documentation](docs/README.md): the architecture, the project storage, the assistant tools, the development workflow, and the release process, with a reference page for every source file.
- The feature guides, one page per area: [documents and the editor](docs/guide/documents-and-editor.md), [the assistant](docs/guide/assistant.md), [external agents (MCP)](docs/guide/external-agents.md), [projects](docs/guide/projects.md), [Projects Home](docs/guide/projects-home.md), [workspaces](docs/guide/workspaces.md), [knowledge](docs/guide/knowledge.md), [the application and the system](docs/guide/system.md), [privacy](docs/guide/privacy.md).
- [Design notes](docs/design/workspaces.md): decisions taken before building.

All the project documentation in `docs/` was produced with OpenWriter itself, using its editor and AI assistant.

## Building and releasing

```bash
npm run dist:desktop  # Windows
npm run dist:mac      # macOS
npm run dist:linux    # Linux
```

Pushing a `v*` tag, or starting the `Build Desktop App` workflow by hand, lints, tests, builds the Windows, Linux, and macOS packages, and publishes them as GitHub Release assets. The steps are in [the technical documentation](docs/README.md#releases).

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

[![Buy me a coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/achilleterb)

