---

# ProjectsPanel.jsx

Source: [`src/components/ProjectsPanel.jsx`](../../../../../src/components/ProjectsPanel.jsx)

Projects view (side tab `projects`): the list of known projects from `projects.json`, each with its avatar ([ProjectIcon.jsx](ProjectIcon.jsx.md), flagged when it is the open project, greyed out when the folder is missing), its name and path, and the last time it was opened.

The buttons at the top open an existing folder or start creating a project by name, and the new project can already be given a document language. The context menu of an entry can open the project, show its settings in a dialog ([ProjectSettings.jsx](ProjectSettings.jsx.md), also usable for a project that is not open), move it to another folder, reveal it in the file manager (with the name the operating system uses), and remove it from the list (marked as dangerous). Errors are shown at the top of the panel.