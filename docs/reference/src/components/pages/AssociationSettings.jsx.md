---

# AssociationSettings.jsx

Source: [`src/components/AssociationSettings.jsx`](../../../../../src/components/AssociationSettings.jsx)

The "Associations" section of the settings: connect OpenWriter with the operating system ([system-integration.cjs](../../../electron/system-integration.cjs.md)).

- **Markdown files**: the state (default app, offered in "Open with", not associated) and the actions that make sense on the platform: associate (on Linux: make it the default app), open the default apps settings (Windows, where the default cannot be imposed), remove the association (where it can be removed). On macOS it explains how to do it in the Finder.
- **Folders**: a switch to add "Open as OpenWriter project" to the folder menu of File Explorer (Windows) or of the file manager (Linux: Nautilus, Dolphin).

Where something is not available (development version, macOS, a missing launcher file or `xdg-mime`) the section says why instead of showing a control that would not work. A folder passed to the app (this entry, or the command line) opens as a project ([main.cjs](../../../electron/main.cjs.md), `project:external`).
