# Contributing to OpenWriter

Thanks for taking the time to contribute. OpenWriter is a local-first desktop Markdown editor (Electron + React + Vite + Tailwind CSS + Tiptap). This page collects the general guidelines: how to get the project running, how the code is laid out, what to run before opening a pull request, and how the documentation is kept in step with the source.

## Before you start

- **Issues first for anything big.** A bug fix or a small improvement can go straight to a pull request. A new feature, a change in behaviour, or a refactor that touches several modules is better discussed in an issue first, using the templates in `.github/ISSUE_TEMPLATE/` (bug report, feature request).
- **Keep changes focused.** One pull request, one subject: a fix and an unrelated clean-up are easier to review apart. Avoid reformatting files you are not otherwise changing.
- **Describe the user-facing behaviour.** Say in the pull request what changes for someone using the application, not only which functions you touched; add a screenshot or a short recording when the change is visible.

## Getting started

Requirements: the current Node.js LTS version (or newer) and npm.

```bash
npm install
npm run dev
```

`npm run dev` starts the Vite server and opens the Electron window. Changes in `src/` reload automatically; changes in `electron/` require restarting the command. For a production build locally:

```bash
npm run build
npm start
```

## Checks to run before a pull request

```bash
npm run lint
npm test
```

- `npm run lint` runs `node --check` on every main-process module: it catches syntax errors, not style problems. There is no ESLint/Prettier configuration in the repository, so match the style of the file you are editing (2-space indentation, no semicolons, single quotes, one export per concern).
- `npm test` builds the renderer bundle, so a change that breaks the build fails here.

Please also start the application and try the path you changed: most of the code only makes sense inside the running app (menus, dialogs, editor, assistant).

## Project layout

```text
electron/          main process: window, menu, IPC handlers, stores, MCP server
src/               renderer: React components, hooks, helpers, i18n, styles
  components/      UI components (one per pane, panel, dialog, settings section)
  lib/             non-React helpers (tools, extensions, editor utilities)
  i18n/            translation runtime and locale catalogs
docs/              technical documentation and reference pages
assets/            application icons and images
```

Rules of thumb:

- **Process boundaries matter.** Anything touching the file system, the OS, credentials, child processes or another window belongs to `electron/` and reaches the renderer through a named IPC channel exposed in `electron/preload.cjs`. The renderer never imports Node modules.
- **Prefer a small module over a large one.** The `electron/` folder is a set of single-purpose CommonJS modules (`*.cjs`); a new concern gets its own file, wired from `electron/main.cjs`.
- **Writes go through the stores.** Document history, notes, bookmarks, memory, links and project settings are written by their own store with the atomic-write helper; do not write into `.ow` directly from a component.
- **Assistant tools are declared, not improvised.** A new tool for the AI assistant is added to the catalog in `src/lib/aiTools.js` (group, name, schema, description) and executed through the tool runner; if an external agent has to reach it through the MCP bridge, it must also be added to the allowed list there.
- **Keep Markdown untouched.** Extended Markdown (tables, footnotes, formulas, GitHub alerts, front matter, HTML) must round-trip exactly as written; extensions that would normalise it are not acceptable.

## Code conventions

- ES modules in `src/`, CommonJS in `electron/`.
- Code comments and internal identifiers in the source are written in Italian; user-visible strings are not — see the next point.
- **No hard-coded user-visible text.** Every string in the interface goes through `t('English text')` (or `tp()` for plurals), with the English text as the key; translations live in `src/i18n/locales/*.json` and the same catalogs are used by the main process (`electron/i18n.cjs`). A key without a translation falls back to the English text, so a new string works immediately and can be translated later.
- Errors that reach the user are messages, not stack traces: wrap them in a sentence that says what was attempted and what to do.
- Accessibility is part of the work: keyboard paths (arrows, Home/End, Enter, Escape, F2, Del), focus handling in dialogs, and `aria-label`s where an icon has no text.

## Documentation

The documentation in `docs/` is part of the change, not an afterthought, and it was produced with OpenWriter itself.

- Reference pages live in `docs/reference/`, mirroring the source tree: one page per module (`electron/*.cjs`, `src/App.jsx`, `src/lib/*`, `src/components/*`), inside folders that follow the real directory hierarchy.
- Every page starts with an `H1` equal to the module path and a `Source:` line linking the physical file, with the right number of `../` steps for its depth (`../../../` from `electron/` and `src/`, `../../../../` from `src/lib/` and `src/i18n/`, `../../../../../` from `src/components/pages/` and `src/i18n/locales/`).
- `docs/INDEX.md` lists every page in its real hierarchy, `docs/reference/src/lib/lib.md` and `docs/reference/src/components/components.md` list the same pages as their folders, and `docs/reference/coverage.md` is the quick check that the pages still match the source tree.
- When you add, rename or remove a module, add, rename or remove its page in the same pull request, and update the three indexes above. The checks listed in `coverage.md` are the ones to satisfy.
- The reference pages describe what the code does, concisely and in English, for someone who has to work on it: responsibilities, exported functions and their options, limits, file formats, IPC channels and tool names. The user-facing overview at the root (`README.md`) is updated only when a feature changes for the user.

## Releases

Releases are automated: pushing a `v*` tag (or running the `Build Desktop App` workflow manually, choosing a patch, minor or major bump) updates the version, runs linting and tests, builds the Windows NSIS installer, the Linux AppImage and the macOS DMG packages, and publishes them on GitHub. Do not bump the version in `package.json` by hand in a pull request.

## Reporting bugs

A useful report says what you did, what you expected, what happened, and how to reproduce it. Please include:

- the OpenWriter version (Settings → About) and your operating system;
- the AI provider and model involved, if the problem is in the assistant;
- whether a project was open, or the main project was in use;
- anything recorded in the application data directory that may help (`crash.log`, `ai-diagnostics.log`), after checking that it contains nothing private.

Never paste API keys, tokens or confidential document text into an issue.

## License

By contributing you agree that your contribution is released under the MIT License, the same terms as the project (see [LICENSE](LICENSE)).
