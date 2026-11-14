# electron/chat-runs.cjs

Source: [`electron/chat-runs.cjs`](../../../electron/chat-runs.cjs)

Who is working on which conversation, and what can be seen while they do. The loop of the assistant (the calls to the model, the tools that act on the editor, the queue) runs in the window that started the work, because the tools act on the documents open in that window. The core does not replace it: it keeps the shared state and passes it on ([Core and windows](../../design/core-and-windows.md), step 4).

- `createChatRuns({ events })` returns the registry. A run is keyed by project and conversation id (the same project with another spelling of the path is the same; without a project it is the "main" project, shared by the windows that have none).
- `start({ sender, project, conversationId })` registers the page that drives the work and announces `chat:run-state` `{ conversationId, running: true }` to the other windows of the project. It returns `false` when another page already drives that conversation (that one stays the driver). When the driving page is destroyed the run ends as interrupted for everyone.
- `live({ sender, project, conversationId, live })` keeps the text so far (`{ text, thinking, status }`, capped) and sends it as `chat:run-live`. Only the driver can send it.
- `end({ sender, project, conversationId })` closes the run (`running: false`); only the driver can.
- `list(project)` is the snapshot for a window that opens, or starts showing a conversation, once the work has begun: `[{ conversationId, running, live }]`.
- `cancel({ project, conversationId })` asks the driving page to stop (`chat:run-cancel`, to that page only).
- `changed({ sender, project, conversationId, kind, queue })` tells the other windows of the project that a conversation changed on disk (`chat:changed`; `kind` is `content`, `queue`, with the queue as saved, or `deleted`). The window that made the change is left out.
- Recipients are chosen with `events.toStore` ([event-bus.cjs](event-bus.cjs.md)): the windows that share the stores of that project.
