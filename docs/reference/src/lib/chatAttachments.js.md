# src/lib/chatAttachments.js

Source: [`src/lib/chatAttachments.js`](../../../../src/lib/chatAttachments.js)

Renderer helpers for the user's chat attachments and token counts, used by [AiChatPanel.jsx](../components/pages/AiChatPanel.jsx.md). No panel state.

- Limits: `MAX_PENDING_ATTACHMENTS` (10 per message), `MAX_MODEL_USER_IMAGES` (8) and `MAX_MODEL_USER_PDFS` (4), the most recent user attachments re-sent to the model.
- `readAttachmentFile(path)`: reads a picked or dropped file through `ai.readAttachment` → `{ kind: 'image' | 'pdf', mime, data, label, size }`; images the main process cannot decode (WebP, GIF…) are converted to PNG in the browser first.
- `prepareImage(mime, data)`: normalizes a base64 image (e.g. pasted) through `ai.prepareImage`, with the same PNG fallback.
- `blobToBase64(blob)`, `canAttach(capabilities, kind)` (`pdf` capability for PDFs, `vision` for images).
- `formatTokens` (1234 → "1.2k"), `formatBytes`, `totalUsage(messages)` (sum of the assistant `usage` of a conversation).
