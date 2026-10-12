# electron/chat-store.cjs

Source: [`electron/chat-store.cjs`](../../electron/chat-store.cjs)

Conversation store under `.ow/chat/`. Each conversation is a readable `<id>.json` file with id (chronologically sortable: timestamp + random suffix), title (max 200 chars, fallback "New conversation"), timestamps, `parentId`/`branchedAt` branching metadata, `contextFrom` links to other conversations, and a message log (all writes atomic).

Message roles: `user`, `assistant`, `tool` (a tool result named by `name`, answering the `toolCall` of the previous assistant message). Content up to 200,000 chars per message; messages preserve timestamps, error flags, model `thinking`, `toolCall` {name, arguments}, user `attachment` {label, detail, noteId}, assistant `nextPrompt` hints, and `images` references. Image payloads live in `.ow/chat/attachments/` as PNG/JPG files referenced by id and MIME type.

Operations: `list` (summaries, newest update first; unreadable files are skipped), `get`, `create`, `save`, `remove` (also deleting attachments no longer referenced by any conversation), `ensureDirectory`, `saveAttachment`, `getAttachment`. Conversation ids are validated (`[A-Za-z0-9_-]{1,80}`).