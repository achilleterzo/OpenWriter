
# WorkspaceSelector.jsx

Source: [`src/components/WorkspaceSelector.jsx`](../../../../../src/components/WorkspaceSelector.jsx)

The selector of the active workspace: a button with the name (or "All projects") that opens a menu to change it or to create a new one, with a **"…" menu** beside it that holds "Add project" (when `onAddProject` is given: the projects list uses it to open a folder as a project), then "New workspace…" and "Edit "name"…" (the edit is only there; it is disabled while "All projects" is active). The active workspace is marked with a check, the others show how many projects they hold. It sits at the top of the projects list ([ProjectsPanel.jsx](ProjectsPanel.jsx.md)), and is the one place to switch the active workspace. It hosts [WorkspaceDialog.jsx](WorkspaceDialog.jsx.md), and reads its state from [useWorkspaces.js](../../hooks.md). A workspace in use gives the button the accent colour.

With `fullWidth` the button takes the whole width of its container (the name on the left, the arrow on the right): that is how the projects list shows it.

**As the search scope.** With `onChange` (and `value`) it is the choice of where to search in the Home ([ProjectsHome.jsx](ProjectsHome.jsx.md)): the same look, but the menu only lists "All projects" and the workspaces (no "New" or "Edit"), picking one calls `onChange(id)` and does not change the active workspace. `embedded` makes it the first element of the search input group (no outer border, square on the right).
