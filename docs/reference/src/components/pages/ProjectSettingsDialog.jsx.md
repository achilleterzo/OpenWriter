# ProjectSettingsDialog.jsx

Source: [`src/components/ProjectSettingsDialog.jsx`](../../../../../src/components/ProjectSettingsDialog.jsx)

Window holding the settings of a project — also one that is not open, or a sub-project — inside the application window: the height is bounded and the settings scroll inside, with the title always visible, on the background and border of the window itself, without a second box inside. The title (with its path as a tooltip) and a close button sit in the header; Escape and a click on the backdrop close it.

The rest of the props go to [ProjectSettings.jsx](ProjectSettings.jsx.md), which is rendered in its `embedded` form.
