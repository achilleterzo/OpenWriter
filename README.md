# OpenWriter

OpenWriter is a local-first desktop Markdown editor with an AI writing assistant. It provides a focused writing environment, project-based organization, and control over where documents, conversations, notes, and history are stored.

Built with Electron, React, Vite, Tailwind CSS, and Tiptap.

## Highlights

- Edit Markdown documents in a rich-text interface while keeping Markdown as the native format.
- Open Markdown, DOCX, and PDF files, and export documents to DOCX or PDF.
- Organize documents by project with a file explorer, multiple tabs, outlines, and resizable panels.
- Restore project sessions, including open documents, unsaved drafts, the active document, expanded folders, and panel state.
- Use an AI assistant to proofread, rewrite, summarize, review, and edit selected text or complete documents.
- Keep conversations, notes, project context, attachments, and document history alongside each project.
- Customize the editor with themes, accent colors, typography, spell-checking languages, and project-level settings.

## AI providers

OpenWriter currently supports:

- Ollama through a configurable local endpoint
- Ollama Cloud through an API key stored in the operating system's encrypted credential storage
- OpenAI Codex CLI through its OAuth flow
- Claude Code through its OAuth flow

Responses can stream text, reasoning, and status updates. Requests can be cancelled, and the maximum number of chained tool steps is configurable.

OpenWriter instructs the CLI providers not to run arbitrary shell commands. Their interaction with the project is mediated through OpenWriter's assistant tools, which can read, create, rewrite, move, and delete project files through controlled operations.

## Assistant tools

Depending on the enabled settings, the assistant can:

- List project directories and read text documents, DOCX, PDF, and supported image files.
- Read the current content of documents open in the editor, including unsaved changes.
- Create directories and new Markdown or text files without overwriting existing files.
- Add, update, and remove anchored notes and suggested replacements.
- Move or delete project files through the app's controlled project operations.
- Browse the web, read browser tabs, and capture document or browser screenshots.
- Use images from the project, downloaded images, and image attachments in conversations.
- Ask single-choice, multiple-choice, and sequential questions.

The `.ow`, `.git`, and `node_modules` directories are excluded from assistant file tools. Read and image operations are size-limited.

## Projects and data

A project is a working directory. When it is opened, OpenWriter creates or reuses a `.ow` directory containing project settings, assistant context, conversations, attachments, notes, and document history. These files are plain text or JSON and can be committed to Git or added to `.gitignore`.

A folder that contains its own `.ow` directory is a sub-project (created on request from the file explorer's context menu, and shown with a distinct icon). As with Git, the nearest `.ow` owns a document's history and notes, so they stay with the sub-project whether you work on it from the parent project or open it as a project of its own. Dragging a document into or out of a sub-project in the file explorer moves its history, notes and memory entries along with it. The assistant receives the instructions of every project enclosing the active document (the nearest one prevailing), unless the sub-project turns inheritance off.

Conversations are stored as readable JSON files and support renaming, deletion, branching, copied message history, and additional conversation context. Image attachments are stored separately and referenced from the conversation log.

Document history supports automatic and manually labelled versions, comparison with the current document, restore, and deletion. Up to 100 versions are retained per document, with older automatic versions removed first.

## Privacy

Document text is sent to the selected AI provider only when you submit a request. With a local Ollama model, the text stays on your machine. Ollama Cloud credentials are stored using Electron's encrypted credential storage.

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
