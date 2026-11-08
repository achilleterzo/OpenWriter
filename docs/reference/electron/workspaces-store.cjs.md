
# workspaces-store.cjs

Source: [`electron/workspaces-store.cjs`](../../../electron/workspaces-store.cjs)

The workspaces: a named set of projects that works as a **filter** on the project list, the Projects Home and the knowledge that the assistant and the external agents reach. A filter of visibility, not an isolation. Design and rules: [Workspaces](../../design/workspaces.md).

"All" (`all`) is the built-in, virtual workspace: every project of the list, no filter. A project can belong to several workspaces and is identified by path.

Two files in the application data (`directory()`):

- `workspaces.json`: the definitions, `{ workspaces: [{ id, name, projects }] }`.
- `workspace.json` (existing): the last open project `{ project }`, plus the active filter `active` and the temporary members `temporary`. It is **always written by merging the fields** (`setLastProject` included): rewriting only `{ project }` would erase the filter at every project opening.

The state is not kept in memory: every call reads the files, so the MCP server (another process) sees at once a change made in the app.

- **Definitions:** `list`, `get`, `find` (by id or by name, ignoring case and spaces), `create`, `rename`, `setMembers`, `addProject`, `removeProject`, `remove` (if it was active, back to All). Corrupt files give empty defaults; invalid entries, the reserved `all` and duplicate ids are discarded.
- **Active workspace:** `active()` (an existing id, otherwise `all`), `setActive(id)` (clears the temporary members), `members()` (null for All).
- **A workspace chosen by the caller:** `membersFor(spec)`: not given = the active one; `false` or `"all"` = every project (null, no filter); a name or id = that workspace; an unknown name is an error that lists the available ones. This is the `workspace` argument of `search_knowledge`.
- **Projects that change:** `removeEverywhere(project)` (removed from the list: out of every workspace and of the temporary members), `replacePath(from, to)` (a moved project keeps its place).
- **Temporary members:** projects an agent opened while a workspace was active. `addTemporary` (never for All or for a member), `dismissTemporary`, `adoptTemporary` (becomes a member), `clearTemporary` (done at startup; changing workspace also clears them).
- **`visibleProjects(projects, { granted, temporary, workspace })`:** the list limited to the workspace (via `limitToMembers` of [shared-knowledge.cjs](shared-knowledge.cjs.md)): members, plus `granted` (projects the asking agent opened itself), plus the temporary members if `temporary` is true (the interface shows them marked; the shared knowledge does not).

Tested in `tests/workspaces-store.test.cjs` and, through the real MCP server, in `tests/mcp-outside.test.cjs`.
