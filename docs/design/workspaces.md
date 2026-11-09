# Workspaces (design)

Status: implemented in three phases: (1) data and filtering, with the MCP tools; (2) the interface: selector, create/edit dialog, project list and Home, opening confirmation, temporary members; (3) one arrangement of the graph per workspace. This page fixes the model, the rules and the places in the code to touch; the reference pages under `docs/reference/` are updated when each part is done.

## Goal

A **workspace** is a named set of projects that acts as a **filter**: the project list, the Projects Home (graph and search) and the knowledge that the assistant and the external agents can reach are limited to the projects of the active workspace. It reduces noise (more precise searches), keeps unrelated work out of an agent's context, and gives a way to keep, for example, a book series apart from client work.

Not a goal: isolation. A workspace limits what the assistant and the agents *receive*; it does not stop an agent from opening another folder with `open_project`, nor another program from reading `knowledge.db`. The settings and the README must say so.

## Model

- **All** is the built-in workspace and is virtual: every project of the list (`projects.json`). It cannot be edited or deleted, and it is what the application does today.
- **A workspace** is `{ id, name, projects: [absolute paths] }`, per user (never inside a project). A project can belong to several workspaces. Projects are identified by path, like everywhere else.
- **The active workspace** is one at a time for the whole application (it has a single window). It is a filter, not a mode: switching never closes tabs or the open project.
- **Temporary members** are projects an agent opened while a workspace was active (see below). They are shown, marked, until the user adds or ignores them, the workspace changes, or the application restarts.

### Files

| File | Content |
| --- | --- |
| `workspaces.json` (new, in `userData`) | the definitions: `{ workspaces: [{ id, name, projects }] }` |
| `workspace.json` (existing) | today only `{ project }` (the last open project). It also keeps the filter: `{ project, active, temporary: [paths] }` |

`setProject` currently rewrites `workspace.json` as `{ project }` only (`main.cjs`): it must **merge** into the existing content, or every project opening would erase the active filter. `active` missing or `all` means no filter, so nothing needs migrating. `temporary` is cleared at startup.

Naming: the code already uses "workspace" for the application's own state (`workspace.json`, `workspace:list-projects`, `workspace:changed`). The new IPC channels use the plural prefix `workspaces:*` and the new module is `workspaces-store.cjs`, to avoid confusion; the interface calls them "Workspaces".

## Rules

1. **Visibility.** A project P is visible to the assistant and the agents working in project A if P shares its knowledge (the existing switch) **and** P is a member of the active workspace (or is granted, see below). Own search in the Home covers the members of the active workspace, including those that do not share (marked "Not shared"), as today but limited to the filter.
2. **Opening a project from outside** (file manager, command line, second launch): a confirmation with a choice among the current workspace (default), another workspace (radio list; choosing it adds the project and switches to it), or none (it stays only in All). The project is always added to All, that is, to the list.
3. **New projects** (created from the assistant, from the interface, or by `open_project create=true`) are added to All and to the active workspace.
4. **An agent opens a project** (`open_project`): no dialog. The project is added to All as today and shown in the active workspace as a **temporary member**, marked, with "Add to workspace" and "Ignore". Visibility follows the opener (below).
5. **Sub-projects** are independent: membership of a parent says nothing about its children, and the other way round. The parent still has the files of the child folder (its index includes them): a workspace does not isolate a child from its parent.
6. **Removing.** Inside a workspace the context menu says "Remove from workspace" (only from there). In All it says "Remove from the list" (as today), and it also removes the project from every workspace. A project that is moved keeps its place in the workspaces (the move flow already updates the list and the sessions).
7. **Missing projects** (disk not connected, folder moved without the app) stay members, marked as missing, and do not appear in the graph.
8. **A project open outside the filter** stays open when the workspace changes; the list and the graph show only the members, and a discreet indicator in the header says the open project is outside the workspace. Its assistant sees itself and the members that share.
9. **Indexing stays global.** Every project with the index on is kept up to date, whatever the filter, so that changing workspace never meets a stale index. The filter applies when searching and listing, not when indexing.

### Agents and the MCP server

- `list_workspaces` (read-only) lists the workspaces and the active one; `open_workspace` (a writing tool, not in read-only mode) makes one active, or "All".
- `search_knowledge` takes `workspace`: omitted = the active workspace; `false` = every project; a name = that workspace. An unknown name is an error that lists the available ones.
- **Reading is not filtered:** `read_document` / `list_documents` on an explicit `@name` work for any shared project, because the name was seen in a search (possibly with `workspace: false`). The workspace decides what is *offered* and searched by default; it is not a barrier (see Goal).
- `project_info` says which workspace is active.

### Temporary members and agents

The MCP server is a separate process, one per agent (stdio), that already remembers the project it switched to (`switchedProject` in `mcp-server.cjs`). The opener's visibility is therefore kept in that process, with no need to identify the agent:

- the server keeps `granted`: the projects it opened itself with `open_project` during its life;
- its own tools (`read_document`, `list_documents`, `outsideSources`) include them, and it passes them to the application with the `search_knowledge` call (like it passes `project` today), so the search sees them too;
- the assistant, the Home and the other agents do **not** see a temporary member until the user adds it, which is what keeps the workspace honest;
- with the optional HTTP server several clients share one process, so the grant is shared among them (stated in the settings).

`workspace.json › temporary` only drives the interface (marker, "Add", "Ignore").

## What the filter covers

| Surface | Today | With workspaces |
| --- | --- | --- |
| Projects list, recents menu | `projectsStore.list()` | members of the active workspace |
| Home graph | `projects:graph` over the indexed projects | members only; edges among members; layout saved per workspace (All keeps today's key) |
| Home search | `searchProjectsForHome` → `outsideFor(null, { everything: true })` | the same, over the members |
| Assistant (`search_knowledge`, `@alias`, `read_document` of other projects) | `outsideFolders()` | the same, with the projects filtered |
| External agents (`search_knowledge` through the bridge, `read_document`, `list_documents`) | `outsideFolders` in `shared-knowledge.cjs`, in the app and in the MCP process | the same, filtered, plus the opener's grants |
| Indexing, vectors, graph data | all indexed projects | unchanged |

The single choke point is `outsideFolders` / `sharedProjects` in [shared-knowledge.cjs](../reference/electron/shared-knowledge.cjs.md): they take the `projects` list. The workspace filter is applied to that list by the callers, with one shared helper.

## Code to touch

| File | Change |
| --- | --- |
| `electron/workspaces-store.cjs` (new) | definitions, active filter and temporary members; `membersOf(dataDirectory)`; atomic writes; merge into `workspace.json`; removal and move hooks |
| `electron/shared-knowledge.cjs` | no change in behaviour; a helper `limitToMembers(projects, members, granted)` used by the callers |
| `electron/main.cjs` | `setProject` merges `workspace.json`; `outsideFolders`, `outsideFor`, `runKnowledgeSearch`, `searchProjectsForHome`, `projects:graph`, `workspace:list-projects` and the recents menu apply the filter; IPC `workspaces:*` (list, create, update, remove, set-active, set-members, add-temporary, ignore-temporary); the external-open flow asks the confirmation; the `open_project` bridge call registers the temporary member |
| `electron/mcp-server.cjs` | `outsideSources()` reads the filter (`workspaces.json`, `workspace.json` in the data directory, read at every call) and the process `granted`; `search_knowledge` sends `granted` to the bridge |
| `electron/mcp-bridge.cjs` | `search_knowledge` accepts the opener's `granted` in its context |
| `electron/preload.cjs`, `src/` | API for the workspaces; selector of the active workspace (projects panel header and Home); dialog to create and edit a workspace (list of projects with a switch beside each); open-project confirmation with radio choices; temporary marker with Add and Ignore; "Remove from workspace" in the menu; layout store keyed per workspace |
| `src/lib/graphLayoutStore.js` | key the saved positions by workspace id (All keeps `openwriter.graphLayout.v1`) |
| `src/i18n/locales/*.json` | texts in the six languages |
| `README.md`, `docs/` | a "Workspaces" section; the limit "filter, not isolation" |

## Order of work

1. **Data and filtering:** `workspaces-store.cjs` with tests, `workspace.json` merge, the helper, and the filter in the knowledge paths (app and MCP process), with the grants. This is where the real value is and it can be tested without any interface.
2. **Interface:** selector, create/edit dialog, project list and Home filtered, open-project confirmation, temporary marker, menu entries.
3. **Graph per workspace and polish:** layout per workspace, recalc per workspace, missing members, documentation.

## Tests

- `workspaces-store`: create, update, remove, membership in several workspaces, removal of a project from all, move of a project, missing members, corrupt file, merge into `workspace.json` without losing `project`, `temporary` cleared at start.
- Filtering: with a fake `projects` list, `outsideFolders` returns only members that share; the opener's grants are included only for the process that holds them; a temporary member is invisible to the others; All gives today's result.
- MCP: `outsideSources` reads the files at every call; `search_knowledge` sends `granted`.
- Layout store: separate keys per workspace; All unchanged.

## Open points and limits

- It is a filter, not a barrier (stated above).
- With "reduce motion" and no changes to the graph code, the per-workspace layout is only a storage key.
- Several windows are not supported (one active workspace for the whole application).
- Sub-project children are not isolated from their parents; a separate option "Exclude sub-projects from the parent's index" could be added later, outside this work.
