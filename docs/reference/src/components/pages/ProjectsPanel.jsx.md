# ProjectsPanel.jsx

Source: [`src/components/ProjectsPanel.jsx`](../../../../../src/components/ProjectsPanel.jsx)

Projects view (side tab `projects`): the list of known projects from `projects.json`, each with its avatar ([ProjectIcon.jsx](ProjectIcon.jsx.md), flagged with an "Open" badge when it is the open project), its name, path and the last time it was opened (or a "Folder not found" note for a folder that has disappeared, whose row is disabled).

The buttons at the top open an existing folder or start creating a project by name; the creation form also asks for the language of the documents, which is saved in the project settings once the folder has been chosen. Each row has a button that opens the project settings in a window ([ProjectSettingsDialog.jsx](ProjectSettingsDialog.jsx.md), which also allows moving the project and, for the open one, opening its context file) and, for projects other than the open one, one that removes it from the list.

The context menu of an entry can open the project, open it in a new window (`openProjectInNewWindow`, another instance of the app: a project already open elsewhere brings that window to the front instead), show its settings, move it to another folder, reveal it in the file manager (with the name the operating system uses) and remove it from the list (marked as dangerous). Errors are shown at the top of the panel.
`onListChanged`: called after the list changes (a project removed, moved, renamed or its settings changed), so that the Home, which is next to the list, reloads its graph at once.

"Add project" (it chooses a folder and, if it is new, makes it a project) is the first entry of the "…" menu beside the workspace selector ([WorkspaceSelector.jsx](WorkspaceSelector.jsx.md)); it used to be an "Open folder" button at the right of the panel title.

**Workspaces.** The selector of the active workspace sits above the list, and the list shows only its projects (the filter is applied by the main process). Inside a workspace the menu and the hover button say "Remove from workspace" (only from there; "Remove from the list" is only for All, and it also removes the project from every workspace). A **temporary** project (opened by an agent) carries a dashed "Temporary" tag with "Add to the workspace" and "Ignore" buttons. The list reads again when the workspaces change. An empty workspace says how to add projects.