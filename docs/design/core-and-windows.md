# Core and windows (design)

Status: **model agreed, all six steps done.** This page fixes the reasoning first (what is the core, what is a window, how things are shared) so that the work can be split into steps. Where the code was only skimmed, the page says so.

Decided: a document is open for editing in **one window at a time** (the others show it read-only or bring that window forward), and **several windows may show the same project**, with tabs and session per window.

## Why

"Open in a new window" starts **another process** of the application. That works, but every thing that cannot exist twice has to be negotiated between processes through files: the primary-instance lock (the MCP bridge and HTTP server), the instance registry (one project, one window), the lock around `graph-layout.json`. Each new shared service adds a new way to lose an update. The places where two processes can write today:

- `graph-layout.json`, `projects.json`, the workspace files, `preferences.json`, `ai-settings.json`: read, change, write, from any process.
- `knowledge.db`: one indexing service and one worker thread **per process** on the same SQLite file. SQLite copes with several writers; what is not avoided is double indexing of the same projects and two processes asking the GPU for embeddings.
- Anything that holds the state in memory (`projectPath`, the stores built with `getProjectPath: () => projectPath`, the `mainWindow` that every event is sent to) cannot be seen by another process at all.

The proposal: **one process.** Every window is a `BrowserWindow` of it. A second launch, or "Open in a new window", is forwarded to the running process (`requestSingleInstanceLock` and the `second-instance` event) and opens one more window. Races become races inside one JavaScript thread, which are solved with a queue or an atomic operation, not with lock files.

## The split

**The core** is what the application does under the hood. It is the current behaviour of the services, kept as it is, but there is exactly one of each:

- the stores and their files: projects, workspaces, preferences, AI settings, chat, notes, bookmarks, memory, links, references, skills, graph layout;
- the knowledge index (one service, one queue, one GPU context);
- the file watchers;
- the AI runs (see below);
- the MCP client, the MCP bridge and the MCP HTTP server for external agents;
- the unsaved-work safety net (crash recovery, drafts).

**A window** is a view with its own concerns and nothing shared by accident: which project and which tabs it shows, the active tab, selection, scroll, zoom, panel layout, the open dialogs, focus. A window never writes a shared file. It sends an **intent** to the core ("save this chat", "move these bubbles", "add this project") and shows what the core says happened.

Three rules follow:

1. **The core is the only writer** of shared state. A window cannot lose another window's update because it never merges anything itself (today `saveLayout` reads, merges and writes from the page).
2. **Windows receive events, they do not poll or watch files.** The core broadcasts changes; each window listens to the topics it shows.
3. **Everything shared has an identity and a revision**, so that a window that was busy can tell what it missed and an event that arrives twice is harmless.

## Streams: a chat is a shared run

Today a chat request is bound to the window that made it: `ai:chat-stream` answers through `event.sender`, and the conversation (messages, the queue, the loop that follows tool calls) is driven from the page and saved with `chat:save`. Checked: the loop lives in the renderer (`AiChatPanel.jsx`, with the tools in `aiTools.js`), and many tools act on the documents open in that window's editor (propose a change, read the open tab). That settles a point the first version of this page left open: **the loop cannot move into the core without moving the editor with it.** What the core can own is the state and its distribution.

In the core model a conversation has a **run**, kept by the core ([`chat-runs.cjs`](../reference/electron/chat-runs.cjs.md)):

- The run is identified by project and conversation id. The window that started the work **drives** it: it announces the start, sends the text as it arrives and announces the end. The core holds the snapshot (the text so far) and tells the other windows of the project.
- Any window that shows that conversation **follows** it: it knows the work is going on, shows the same text, and gets the saved messages as they are written. A window that opens late asks for the snapshot first and then follows the events.
- Another chat is another run, independent. Starting it in one window never touches a run in another.
- What a follower writes goes to the queue of the conversation, which is saved in its file and sent to the driver, which takes it into the work. Stopping is a request to the driver, from whichever window; there is one answer.
- If the driving window closes (or its page dies) the work ends as **interrupted** for every window. It is not kept alive by the core: the tools that were running were acting on that window. This is the one part of the first idea that did not hold: closing the window that started a run **does** stop it.
- Saved changes of a conversation (a message, the queue, a title, a deletion) reach the other windows of the project as `chat:changed`; the window that made the change does not receive it.

A run whose tools do not need an editor (a plain question with no tool call) could one day be driven by the core itself; the registry and the events would not change.

## Edits visible between windows

Two different things, and the first is much cheaper than the second:

- **Saved changes.** A document, a note, a bookmark, the layout or the project list changed on disk or by an intent: the core tells every window that shows it (`workspace:changed` and `workspace:annotations-changed` become broadcasts from one watcher instead of one watcher per window sending to `mainWindow`). A window with no unsaved edits of its own reloads silently; one with unsaved edits shows the existing "changed on disk" flow.
- **Live typing** of the same document in two windows. This needs a shared document model and conflict handling. Options, from the least to the most work: (a) a document is open for editing in **one window at a time** and other windows show it read-only or bring that window to the front, as is done today for projects; (b) edits are shared on save and conflicts are resolved with the revision; (c) real-time shared editing with a CRDT (Tiptap has support for it). Decided: (a) and the saved changes; (c) only if two windows on one document turn out to be a real use.

## Does a project stay in one window?

Today the registry guarantees one window per project because two processes would clash on the session, history and index. With one core the clash is gone, so the rule becomes a **choice**, not a limit. Decided: allow several windows on one project from the start (chat runs and saved changes are shared as above), keep the **tabs and the session per window**, and keep documents editable in one window at a time. If that proves confusing, the old rule is a check in one place.

## What replaces what


| Today                                                  | In the core model                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------------- |
| `primary-instance.cjs` (election, hand-over)           | not needed: the one process serves the bridge and the HTTP server |
| `instance-registry.cjs` and the `.focus` files         | `second-instance` and an in-memory list of windows                |
| lock around `graph-layout.json`, merge in the renderer | the layout store merges node positions in memory and writes once  |
| one `knowledge` service per process                    | one service, one queue                                            |
| `projectPath` and `mainWindow` as module variables     | a context per window, passed to the stores                        |
| watchers per process, events to `mainWindow`           | one watcher per folder, broadcast to the windows that show it     |


## Steps

1. **Confirm the model** (this page) and list what is still open (below).
2. **A context per window**, still with one window. **Done:** the module variable `projectPath` and the stores built on it (`projectFile`, chat, memory, browser history, notes, bookmarks, links, references, web references, project tools) are now one object from [`window-context.cjs`](../reference/electron/window-context.cjs.md); `main.cjs` creates one at startup and reads `windowContext.project` where it read `projectPath`. Behaviour is unchanged. Not done yet, and left for the steps that need it: the IPC handlers still use the one context (they will resolve it from the window that called), and the state tied to the open project that is still a variable of the process (`knowledgeOn`, `semanticSignature`, `referenceWatchers`, `workspaceWatcher`, `changedPaths`, `viewMode`, `homeOpen`).
3. **An event bus.** **Done:** every send to the windows from `main.cjs` goes through [`event-bus.cjs`](../reference/electron/event-bus.cjs.md), which takes the recipient as part of the call (all windows, those showing a project, the focused one, a page, the host of an embedded page). Still one window: every recipient resolves to it, so nothing changes for the user. What is still direct: the hidden GPU window and the `mcp:request` of the bridge, which receives the window to ask from the bus (`forProject`, then the focused one). What is not done: the window itself (`mainWindow`) is still a variable of the process, used for the things that belong to one window (its menu, its zoom, its crash handling); step 3 turns it into one entry per window.
4. **Several windows in one process.** **Done:** `openWindow` makes a context per window and "Open in a new window" opens it in the same process; the handlers resolve the context of the window that made the request (an `AsyncLocalStorage` around every `ipcMain` listener, with the focused window as fallback); what a window watches moved into its context; the primary-instance lock and the instance registry are gone (the MCP bridge and HTTP server start once). A second launch is forwarded to the running process. Checked by running the application with a separate data folder and driving two windows over the debugging port: two projects in two windows, a chat created in one not seen in the other, a file change reaching only the window that shows the project, the same project in two windows with separate saved sessions (`<project>` and `<project>#1`), closing a window leaving the others alive. Not checked: the packaged application's single-instance path, and the native menu. `file-lock.cjs` stays for the layout file until step 5. Known limits: the spell-check languages are applied to the shared browser session, so with two projects that set different languages the last one applied wins; the window state file (position, size) is shared and keeps the last window closed; a session saved under `<project>#<slot>` is not moved with the project.
5. **Chat runs in the core.** **Done, in the form described under Streams:** the core keeps who drives which conversation, the text so far and the notifications; the loop stays in the driving window. Checked over the debugging port with two windows on one project: the follower receives the state, the streamed text in order, the queue written by the other window and the saved messages; the driver receives the queue and the stop request; a window that asks late gets the snapshot; closing the driving window ends the run as interrupted. Compiled, and the panel is wired to it (`useSharedChatRun`), but **not exercised through the interface**: with a fresh data folder the assistant is off, so the panel was not mounted. Not done: a follower's "send now" (Ctrl+Enter) does not interrupt the driver's current answer, it is taken at the next call; two windows starting the same conversation at the same moment (the second is refused by `start`, but its panel only learns it from the state events).
6. **Single writers.** **Done:** with one process, a read-change-write that has no `await` in the middle cannot be interleaved with another, so most of the shared files (projects, workspaces, the session, the AI settings, the preferences, whose copy lives in memory) were already safe once the lock files went; what was left was the merge that a **page** did on the layout. The merge is now done by the core (`layout:merge`, [`layout-merge.cjs`](../reference/electron/layout-merge.cjs.md)) and the page only sends the bubbles it moved. `file-lock.cjs` is gone. What the core now also does is tell the other windows: preferences (`preferences:changed`), the general settings (`app:settings-changed`), the project list (`workspaces:changed` after a project is opened or moved) and the layout (`layout:changed`). Checked by running the application with two windows: two windows saving different bubbles at the same moment both end up in the file, and the other window is told; a preference and the saved AI settings reach the other window and not the one that made them; opening a project refreshes the list in both. Not done: the **file** layer is still unprotected against a second copy of the application on the same data folder (the installed application refuses a second start with `requestSingleInstanceLock`; a development run does not); window state and `sessions.json` are still written whole by whoever saves last. The interface of a window that is already showing a preference (a setting read once when it was drawn) does not redraw on its own when another window changes it; the next time it reads the value, it gets the new one.
7. **Documents.** **Done:** one editing window per document, and saved changes between windows. [`document-owners.cjs`](../reference/electron/document-owners.cjs.md) keeps who edits what; each window declares the set of documents it wants (`documents:set-held`), a document that another window edits opens read-only (`heldElsewhere`) with a bar and a button to bring that window forward, and it becomes editable when freed. A save tells the other windows (`document:saved`), which covers documents outside the project folder that no watcher sees; inside it, the project watcher already did the job through `workspace:changed`. Checked by running the application with two windows on one project and driving the interface: the second window's tab was read-only with the bar, followed two saves of the first window, and became editable (bar gone) when the first window closed its last tab on the file. A screenshot of the second window showed the bar and the button. Not checked: the button itself (`documents:reveal`), text files (`kind: 'text'`, not covered), and pinned tabs that are closed but kept (they do not hold a document). Seen once and not explained: a window with two `a.md` tabs after a scripted double click; a single click gave one tab, and the two clicks of the script come within the same frame, so it looks like the existing preview logic reading `latest.current` before the render, but it was not checked on the previous version.

Each step leaves the application working; steps 1 and 2 change nothing the user can see.

## Open points

- How many of the stores read `projectPath` directly instead of through `getProjectPath`; this decides the size of step 1.
- The GPU context uses a hidden window: how it behaves with several visible ones.
- Webview browser tabs (`will-attach-webview`) are tied to `mainWindow`.
- Temporary workspace members and the "startup pending" files assume one session per process.
- Crash isolation: with one process, a crash of the core closes every window. The renderers stay separate processes, so a page crash does not; a crash of the main process does.

## Pages removed

With the single-process model in place, the reference pages of the modules that no longer exist were removed: `reference/electron/primary-instance.cjs.md` and `reference/electron/instance-registry.cjs.md` (`file-lock.cjs` never had a page of its own). Their content survives here, in the table above and in the steps that describe what replaced them; the modules that do exist ([window-context.cjs](../reference/electron/window-context.cjs.md), [event-bus.cjs](../reference/electron/event-bus.cjs.md), [document-owners.cjs](../reference/electron/document-owners.cjs.md), [layout-merge.cjs](../reference/electron/layout-merge.cjs.md), [chat-runs.cjs](../reference/electron/chat-runs.cjs.md)) have their pages.

