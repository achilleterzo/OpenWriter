---

# electron/system-integration.cjs

Source: [`electron/system-integration.cjs`](../../../electron/system-integration.cjs)

Integration with the operating system, per platform: associating Markdown files with OpenWriter and adding the "Open as OpenWriter project" entry to the file manager menu of folders. Where there is no reliable and permitted way it says so (`supported: false` with a reason) instead of pretending.

`createSystemIntegration({ platform, exePath, packaged, run, fsImpl, home, env, label })` returns `status()`, `setMarkdown(on)` and `setFolderMenu(on)`; the last two return the new status. `run(file, args)` → `{ code, stdout }` (`execFile` in the app, a fake in the tests). `label` is the text of the folder entry (string or function, in the language of the app when it is registered). Status: `{ platform, markdown: { supported, reason?, registered, isDefault, canRemove }, folder: { supported, reason?, enabled } }`.

| Platform | Markdown files | Folder entry |
| --- | --- | --- |
| Windows | The user's registry (`HKCU\Software\Classes`, no administrator rights): a ProgID `OpenWriter.Markdown` offered in "Open with" for `.md`, `.markdown`, `.mdown` (and set as the registered app only where no other app is). Windows does not let an app make itself the default: the status says whether OpenWriter is (`UserChoice`) and the interface opens "Default apps". Removable. | `Directory\shell\OpenWriter` and `Directory\Background\shell\OpenWriter` with `"exe" "%1"` / `"%V"`; active only if it points to this executable. |
| Linux | `xdg-mime default openwriter.desktop text/markdown` (needs the `.desktop` file, present in the installed package, and `xdg-mime`). `xdg-mime` cannot remove an association: not removable from here. | A Nautilus script and a Dolphin service menu in the user's folder. |
| macOS | Not possible from inside the app: the document types are already declared in the bundle ("Open with" in the Finder); the default is chosen in the Finder (Get Info → Open with → Change All…). Reason `mac-manual`. | Not possible (reason `mac-manual`). |
| Other | Not supported (`platform`). | Not supported. |

Nothing is registered in the development version (`development`: the executable would be Electron's, not the app's). Reasons: `development`, `mac-manual`, `no-desktop-file`, `no-xdg-mime`, `platform`.

The main process ([main.cjs](main.cjs.md)) exposes it as `integration:status`, `integration:set-markdown`, `integration:set-folder-menu` and `integration:open-default-apps`; the interface is [AssociationSettings.jsx](../src/components/pages/AssociationSettings.jsx.md).
