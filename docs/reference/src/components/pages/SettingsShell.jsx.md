# SettingsShell.jsx

Source: [`src/components/SettingsShell.jsx`](../../../../../src/components/SettingsShell.jsx)

The frame shared by the settings windows — the general ones ([SettingsScreen.jsx](SettingsScreen.jsx.md)) and those of a project ([ProjectSettings.jsx](ProjectSettings.jsx.md)) — so both look the same: a header, a vertical navigation of sections (horizontal on narrow screens) and a scrollable panel (up to 6xl wide and 900 px high, within the window).

- Props: `sections` (`[{ id, label, icon }]`), `section` and `onSection`, `onClose`, `eyebrow` (the line above the title, with `eyebrowIcon`), `subtitle` (under the title: the project name), `layer` (the z class: the project window sits above the other screens) and `backLabel`. The title is the label of the current section.
- The header has, at the right, the place for the actions of the current section ([SettingsActions.jsx](SettingsActions.jsx.md)): the project window puts "Save settings" there.
- Escape closes the window, but not while a nested window (marked `data-nested-dialog`) is open: that one closes first. A click on the backdrop closes it too, only when press and release both happen there (dragging a selection out of the panel must not close it).
