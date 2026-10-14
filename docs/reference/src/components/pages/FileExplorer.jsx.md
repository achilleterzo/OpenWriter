# FileExplorer.jsx

Source: [`src/components/FileExplorer.jsx`](../../../../../src/components/FileExplorer.jsx)

Project file tree. Without a project it shows a placeholder with the button that opens a folder.

- Header: the project avatar and name (clicking it opens the folder in the file manager) and the buttons for a new folder, a new document, moving a project here, refreshing, and opening the project settings in a dialog ([ProjectSettings.jsx](ProjectSettings.jsx.md), usable for the open project and for a sub-project).
- The tree lists folders and supported documents, loads a folder's children when it is expanded, and marks the project root, sub-projects (with their own icon) and empty folders.
- A document imported from DOCX or PDF shows its original file underneath, read-only and with a lock icon, opened on request.
- In-line rename (F2 or the context menu; Enter confirms, Escape cancels, and losing focus confirms) and new folder/document typed in place; a document name keeps `.md` when the extension is omitted.
- Context menu: open, new folder, new document, create sub-project, sub-project settings, open as project, make standalone project, move a project here, rename, delete (with confirmation), reveal in the file manager (with the name the operating system uses). Delete and rename report their failures in the status bar.
- Drag and drop: files from the system are copied into the folder under the pointer (or into the project root), while an element of the tree dragged into another folder is moved, with its history, notes and memory entries; dropping an item where it already is changes nothing.
- A "Linked documents" section at the bottom lists the Markdown files linked from outside the project ([project-links.cjs](../../../electron/project-links.cjs.md)), opened and edited where they are: the context menu can open them, update a link that points to a missing file, reveal it, or unlink it (the file is not touched).

