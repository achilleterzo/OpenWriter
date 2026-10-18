# ProjectsPanel.jsx

Source: [`src/components/ProjectsPanel.jsx`](../../../../../src/components/ProjectsPanel.jsx)

Projects view (side tab `projects`): the list of known projects from `projects.json`, each with its avatar ([ProjectIcon.jsx](ProjectIcon.jsx.md), flagged with an "Open" badge when it is the open project), its name, path and the last time it was opened (or a "Folder not found" note for a folder that has disappeared, whose row is disabled).

The buttons at the top open an existing folder or start creating a project by name; the creation form also asks for the language of the documents, which is saved in the project settings once the folder has been chosen. Each row has a button that opens the project settings in a window ([ProjectSettingsDialog.jsx](ProjectSettingsDialog.jsx.md), which also allows moving the project and, for the open one, opening its context file) and, for projects other than the open one, one that removes it from the list.

The context menu of an entry can open the project, show its settings, move it to another folder, reveal it in the file manager (with the name the operating system uses) and remove it from the list (marked as dangerous). Errors are shown at the top of the panel.