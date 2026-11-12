# src/lib/toasts.js

Source: [`src/lib/toasts.js`](../../../../src/lib/toasts.js)

Pop-up notifications ("toasts") on four levels, like an extended traffic light: `info` (accent colour), `success` (green), `warning` (yellow), `error` (red). The explicit notices of the application arrive here, together with the errors and warnings of the console (including the unhandled ones) and those of the main process (see [main.cjs](../../../../electron/main.cjs.md), channel `app:notice`). A notification equal to a very recent one is not repeated: its counter grows. The React side that draws them is [ToastHost.jsx](../components/pages/ToastHost.jsx.md).

- `LEVELS`: `['info', 'success', 'warning', 'error']`; an unknown level becomes `info`.
- Limits: `DURATION` per level — info 5 s, success 4 s, warning 8 s, error 12 s — `DEDUPE_MS` (4,000 ms) for the repetition window, `MAX_VISIBLE` (5) items kept, the oldest dropped.
- `notify(level, message, { detail })`: adds a notification. The message is trimmed and an empty one is ignored; `detail` (the stack or the explanation, shown on request) is trimmed too. A notification with the same level and the same message within `DEDUPE_MS` increments the `count` of the existing one, refreshes its `at` and restarts its timer.
- `subscribe(listener)`: registers a listener, calls it immediately with the current items and returns the function that unsubscribes it.
- `dismiss(id)`: clears the timer and removes the notification.
- `hold(id)` / `release(id)`: stop and restart the timer of a notification (the mouse over it, to read or copy it).
- Each item is `{ id, level, message, detail, count, at }`.
- `installDiagnostics()`: called once at startup (a `done` flag and a guard for a missing `window` make later calls no-ops). It wraps `console.error` and `console.warn` (keeping the original output) and listens for `error` and `unhandledrejection` on the window, turning each into a notification: the first line of the message (at most 300 characters) with, as detail, the first lines of the stack or of the remaining arguments. A `busy` flag stops a notification from triggering another one. `IGNORED` drops the noise that does not concern the user: `ResizeObserver loop`, `Error invoking remote method` (the main process reports it itself with the reason), the React DevTools message, `Warning:`  of React, `Autofill.` and the Electron security warnings.

