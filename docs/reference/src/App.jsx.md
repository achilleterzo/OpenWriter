# src/App.jsx

Source: [`src/App.jsx`](../../src/App.jsx)

Root component and workspace state holder: tabs, active document, project, side panel, expanded folders, assistant panel, conversation, chat context pins, notes, find requests, context menu, and layout state.

- Builds the tab model: untitled documents, opened files (Markdown savable in place; DOCX and PDF become new documents, keeping the original as `sourcePath`), and browser tabs that carry no editor or session state.
- Persists and restores the per-project session, including drafts kept in the session for dirty or unsaved tabs, expanded folders, side tab, and the active conversation; older sessions with embedded chat are imported once into `.ow/chat`.
- Executes workspace actions: new/open/close tabs, path rename and delete remapping across tabs, folders, and history, find and replace requests, browser tabs, title and dirty/save bookkeeping.
- Hosts the tool bridge the assistant uses to read the live editor content of open documents and to request the app-level tools.