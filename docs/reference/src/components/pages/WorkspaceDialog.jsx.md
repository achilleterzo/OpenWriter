
# WorkspaceDialog.jsx

Source: [`src/components/WorkspaceDialog.jsx`](../../../../../src/components/WorkspaceDialog.jsx)

Creates or edits a workspace: a name and, for every project of the list, a switch that adds or removes it (the list comes from `listAllProjects`, unfiltered; a filter box appears above six projects).

- **New:** the changes are applied with "Create", and the new workspace becomes the active one.
- **Edit:** every change applies at once (a switch, or the name on Enter or when the field loses focus); if one fails the switch goes back. "Delete workspace" asks for a confirmation: the projects are not deleted, they stay in the list and in All projects.
- Missing projects (folder not found) are dimmed but can stay in a workspace. Two quick clicks both count (the current value is also kept in a reference).
