# Projects and data

What a project is on disk, the file explorer, sub-projects, linked documents, the main project, conversations and history.

[Back to the technical documentation](../README.md) · [Back to the README](../../README.md)

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
