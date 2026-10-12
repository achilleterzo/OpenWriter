# src/App.jsx

Source: [`src/App.jsx`](../../src/App.jsx)

Root component and workspace state holder: tabs, active document, project, side panel (`sideTab`), expanded folders, assistant panel, conversation, chat context pins, notes, find requests, context menu, layout, and the settings screen (opened by the app menu or after a language change).

- Builds the tab model: untitled documents, opened files (only Markdown saves in place; DOCX and PDF become new documents keeping the original as `sourcePath`), and browser tabs (`kind: 'browser'`) that carry no editor or session state. Document tabs keep `untitled` counters.
- Persists and restores the per-project session: open tabs (drafts kept in the session for dirty or never-saved tabs; other documents reopened from disk), active id, side tab, expanded folders, assistant state, chat context pins, and the active conversation. Older sessions with embedded chat are imported once into `.ow/chat`.
- Executes workspace actions: new/open/close tabs, path rename and delete remapping across tabs (a deleted file keeps its tab open as unsaved text), find and replace requests (Ctrl+F / Ctrl+H), browser tabs, titles, and dirty/save bookkeeping.
- Projects: switch (saving the session first), open, create, and the projects home tab when no project is open.
- Tool bridge for the assistant: live editor text of open documents (including unsaved changes), `list_versions`/`read_version`, memory operations (`remember`, `recall`, …), browser tab listing/selection, document and browser screenshots, automatic "Before the AI edit" version snapshots, note change events, path change events (delete/rename refresh tabs and explorer), and opened-file opening.
- Note integration: loads the notes of the context document, highlights them in the editor through the annotation extension, selects notes (opening the Notes side tab), and forwards "ask AI" requests from notes to the chat panel.
- Link handling: Ctrl+click opens project files in a tab, external links in the system browser, and explains unresolved relative links.
- Layout: left side panel and assistant panel widths are clamped and committed to `lib/layout.js`, with a status bar showing the project and last status message.

