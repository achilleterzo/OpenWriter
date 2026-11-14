# Documents and the editor

Everything the editor does with a document: Markdown, notes, bookmarks, history, import and export, text files.

[Back to the technical documentation](../README.md) · [Back to the README](../../README.md)

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
- **Text files.** Any file that is not a document opens in the text reader, from the explorer or from File → Open → All files. It is read and saved without interpretation: line endings (LF or CRLF), the UTF-8 signature, and the permissions of the file stay as they were. Files over 1 MB, binary files, and files that are not UTF-8 are not opened, and the message says why. The assistant and the external agents work on documents, not on these tabs.
- An Info tab with the statistics of the document in front: last save, words, characters, sentences, pages, reading and speaking time, average and longest sentence, structure (headings, lists, tables, images, links, footnotes, formulas), and the numbers of the selected text.
- Many modified documents can be saved at once from the tab bar; a document modified by the assistant counts as modified until you accept its edits.
- The chat box takes a restricted Markdown (bold, italic, code, lists, links) with no visible toolbar: paste Markdown, start a line with `- ` for a list, and the replies and the assistant's questions are rendered as Markdown too.

## Several windows

A document is edited in one window at a time. If you open it in a second window while the first has it open, the second shows it read-only, with a bar that says so and a button that brings the first window to the front. The read-only copy follows what is saved: when the first window saves, the text updates by itself. When the first window closes the document (or is closed), the second one becomes editable. Documents outside the project follow the same rule.

