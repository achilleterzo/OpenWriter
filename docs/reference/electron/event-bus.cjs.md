# electron/event-bus.cjs

Source: [`electron/event-bus.cjs`](../../../electron/event-bus.cjs)

The one place the process sends events to the windows from. Before, every send was `mainWindow.webContents.send(...)`: fine with one window, but it does not say who an event is for once there are several. Here each send states its recipient, and the bus knows which windows exist and what each shows. The plan is in [Core and windows](../../design/core-and-windows.md) (step 2, and used by step 3: now with several windows).

- `createEventBus({ samePath })` returns the bus. `register(window, context)` adds a window with its [window context](window-context.cjs.md); it leaves by itself when the window closes, and the function it returns removes it earlier.
- `broadcast(channel, ...args)`: every window. For what does not depend on a project: the workspace list changed (`workspaces:changed`), the notices of the application (`app:notice`).
- `toProject(project, channel, ...args)`: the windows that show that project (the context's `project`, read at every call, compared with `samePath`). For what changes inside a project: files changed (`workspace:changed`), notes and bookmarks (`workspace:annotations-changed`).
- `toStore(project, { except }, channel, ...args)`: the windows that share the stores of that project (those with no project share the "main" one), except the page that made the change. For the conversations saved by one window and read by the others (`chat:changed`, `chat:run-state`, `chat:run-live`).
- `toOthers(except, channel, ...args)`: every window except one page, usually the one that made the change (a preference, the general settings, the layout). Without `except`, every window.
- `toFocused(channel, ...args)`: the window in front, or the first when none is. For the native menu commands (`app:command`, `document:command`), questions to the user (`dialog:ask`), and a file or folder opened from outside (`document:external`, `project:external`).
- `toContents(webContents, channel, ...args)`: that page, usually whoever made the request (the assistant stream `ai:stream`, the edit context menu, the start of an image extraction).
- `toHostOf(contents, channel, ...args)`: the window that hosts an embedded page, for the events of a browser tab (`browser:open-tab`, `browser:pointer-down`, `browser:context-menu`).
- `focused()`, `windowFor(webContents)`, `forProject(project)`, `list()` and `count()` answer "which window" without sending anything; the MCP bridge uses `forProject` to tell whether a window shows the project an agent asks for.
- Every send returns how many windows received it (0 for none), which is how a question to the user knows nobody could answer it.
- Not through the bus: the `embed:request` of the hidden GPU window (`gpu-context.cjs`), which is not a window the user sees, and the `mcp:request` the bridge sends to the window it was given.
