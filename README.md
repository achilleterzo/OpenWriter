# OpenWriter

OpenWriter is a local-first desktop Markdown editor with an AI writing assistant. It provides a focused writing environment, project-based organization, and control over where documents and conversations are stored.

Built with [Electron](https://www.electronjs.org/), [React](https://react.dev/), [Vite](https://vite.dev/), [Tailwind CSS](https://tailwindcss.com/), and [Tiptap](https://tiptap.dev/).

## Highlights

- Edit Markdown documents in a rich-text interface while keeping Markdown as the native format.
- Open Markdown, DOCX, and PDF files, and export documents to DOCX or PDF.
- Organize documents by project with a file explorer, multiple tabs, outlines, and resizable panels.
- Use an AI assistant to proofread, rewrite, summarize, review, and edit selected text or complete documents.
- Keep conversations, notes, project context, and document history alongside each project.
- Choose between local and authenticated AI providers.
- Customize the editor with themes, accent colors, typography, spell checking, and project-level settings.

## AI providers

OpenWriter currently supports:

- [Ollama](https://ollama.com/) for local models
- Ollama Cloud
- OpenAI Codex CLI
- Claude Code

CLI providers run in read-only mode and authenticate through their own OAuth flows. OpenWriter does not read or pass API keys from the environment to these providers.

## Privacy

OpenWriter is designed to keep projects on your computer. Document text is sent to an AI provider only when you submit a request. When using a local Ollama model, the text stays on your machine.

Project settings, conversations, notes, and document history are stored as readable files in the project's .ow directory. You can commit this directory with your project or add it to .gitignore.

## Getting started

Requirements: [Node.js](https://nodejs.org/) current LTS or newer and npm.

```
git clone https://github.com/YOUR-USERNAME/openwriter.git
cd openwriter
npm install
npm run dev
```

The development command starts Vite and opens the Electron application. Changes in src/ reload automatically; changes in electron/ require restarting the development command.

To create and run a production build locally:

```
npm run build
npm start
```

## Documentation

The technical documentation is available in docs/INDEX.md. It covers the application architecture, project storage, assistant tools, development workflow, and release process.

## Building installers

```
npm run dist:desktop  # Windows
npm run dist:mac      # macOS
npm run dist:linux    # Linux
```

Release builds are also produced by the GitHub Actions workflow when a version tag is pushed.

## Contributing

Issues and pull requests are welcome. Before opening a pull request, please run:

```
npm run lint
npm test
```

Please keep changes focused and include a clear description of the user-facing behavior they affect.

## License

This project is currently under active development. Licensing information will be added before the first public release.