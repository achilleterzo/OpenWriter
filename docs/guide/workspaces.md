# Workspaces

Named sets of projects that filter the list, the Home and the knowledge agents reach.

[Back to the technical documentation](../README.md) · [Back to the README](../../README.md)

A workspace is a named set of projects that works as a **filter**. The workspace selector (at the top of the projects list) switches between **All projects** and your workspaces; the active one limits the project list, the graph and the search of the Home, and the knowledge that the assistant and the external agents reach by default.

- **Create and edit:** "New workspace…" (in the selector menu, or in the "…" menu beside it, where "Edit" also is) opens a dialog with the list of your projects and a switch beside each one. A project can be in several workspaces. Deleting a workspace never deletes its projects.
- **New projects** (created, or opened for the first time) join the active workspace. A folder opened from the file manager asks where to add it: the current workspace, another one, or none (it stays only in All projects).
- **Search:** the Home search has a select in front of the field to search all the projects or one workspace (it starts on the active one, and is hidden when you have no workspaces).
- **Graph:** each workspace keeps its own arrangement of the bubbles, and "Recalculate" works on the one you see.
- **Remove:** inside a workspace "Remove from workspace" takes the project out of it only; "Remove from the list" (in All projects) removes it everywhere.
- **Agents:** the MCP server has `list_workspaces` and `open_workspace`, and `search_knowledge` takes a `workspace` argument (omitted: the active one; `false`: every project; a name: that workspace). A project an agent opens appears in the active workspace as **temporary**: you add it to the workspace or ignore it, and meanwhile it stays visible only to that agent.
- **It is a filter, not an isolation:** it limits what the assistant and the agents receive, but an agent can still open another folder, and the index is one file for all the projects.
