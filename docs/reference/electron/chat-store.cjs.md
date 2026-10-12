# electron/chat-store.cjs

Source: [`electron/chat-store.cjs`](../../electron/chat-store.cjs)

Conversation store under `.ow/chat/`. Each conversation is a readable `<id>.json` file with id, title, timestamps, parent/branching metadata, `contextFrom` links to other conversations, and a message log.

Message roles are `user`, `assistant`, and `tool`. Messages preserve text, timestamps, error flags, model thinking, tool calls with arguments, attachment labels, and next-prompt hints. Attachment payloads live in `.ow/chat/attachments/` as PNG or JPG files and are referenced from the message log by id.

Operations: list (with summaries), get, create (with chronologically sortable ids), save, remove (deleting orphaned attachments only), ensureDirectory, saveAttachment, getAttachment. Titles, messages, and attachments are validated and size-limited, and all writes are atomic.