# electron/file-clipboard.cjs

Source: [`electron/file-clipboard.cjs`](../../electron/file-clipboard.cjs)

Files in the system clipboard: copy or cut in OpenWriter and paste in the file manager or in other programs, and the other way round. Every operation times out after 15 seconds.

- `write(paths, mode)`: puts the files in the clipboard, as `copy` or `cut`. On Windows it uses PowerShell (`DataObject` with the `FileDrop` list plus `Preferred DropEffect`, which carries copy or cut the way File Explorer does, several files at a time); on macOS `osascript` with JXA on `NSPasteboard` (the Finder has no "cut", so it always copies); on Linux the formats the file managers use (`x-special/gnome-copied-files`, or `text/uri-list` with `x-kde-cutselection`).
- `read()`: `{ paths, cut }` when the clipboard holds files, `null` otherwise. On Windows it reads the `FileDrop` list and the drop effect; on macOS the file URLs on the pasteboard; on Linux the GNOME format first and then the KDE one.

PowerShell scripts are passed encoded (`-EncodedCommand`, UTF-16LE) and their output is read as UTF-8.
