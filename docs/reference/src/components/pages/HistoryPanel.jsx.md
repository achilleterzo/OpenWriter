# HistoryPanel.jsx

Source: [`src/components/pages/HistoryPanel.jsx`](../../../../../src/components/HistoryPanel.jsx)

Version history of the active document, read through the version IPC from `.ow/history/`.

- A field with an optional label (up to 120 characters, Enter saves) and the button that saves the current text as a version right away, under the label or under "Manual version".
- The list, newest first, shows each version's label (or "Automatic save" / "Version"), the date and time, and the size in characters; hovering reveals its buttons: compare with the current text (the dialog [VersionDiffDialog.jsx](VersionDiffDialog.jsx.md)), restore, and delete.
- A restore archives the current text first ("Before the restore"), so the operation is always reversible, and leaves the document restored but not saved yet.
- Placeholders explain the cases where there is no history to show: no project open, a document never saved as Markdown inside the project, or a document outside the project folder.

