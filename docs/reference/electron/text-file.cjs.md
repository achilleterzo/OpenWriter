
# text-file.cjs

Source: [`electron/text-file.cjs`](../../../electron/text-file.cjs)

Reading and saving of any text file for the text reader ([TextPane.jsx](../src/components/pages/TextPane.jsx.md)): code, configuration, logs, data. The file is read and written without being interpreted, and without changing anything beyond what the user edits.

- `decodeText(buffer)` → `{ text, eol, bom }`: UTF-8 (with or without signature); the line ending is detected (`lf` or `crlf`, the prevalent one) and the text is normalized to LF, because the text field only has one kind. A file with a null byte in the first 8000 bytes, or that is not valid UTF-8, is refused with `code: 'NOT_TEXT'`.
- `encodeText(text, { eol, bom })` puts back the line endings and the signature: with the same text the file is identical byte for byte.
- `readTextFile(file, { limit })` refuses a file over `TEXT_LIMIT` (1 MB, `TEXT_TOO_LARGE`): the text field is a plain `textarea` with a mirrored column of lines, which stays comfortable up to about that size.
- `writeTextFile(file, text, options)` writes atomically ([atomic-write.cjs](atomic-write.cjs.md)) and passes the permissions of the old file to the new one, so an executable script stays executable.
- `isBinaryName(name)`: known binary extensions (archives, executables, media, office files, fonts, databases). The file tree marks as openable every file that is not of such a type; a file that turns out not to be text says so when opened.

Tested in `tests/text-file.test.cjs`. [main.cjs](main.cjs.md) uses it in `text:open`, `text:save` and the Open dialog.
