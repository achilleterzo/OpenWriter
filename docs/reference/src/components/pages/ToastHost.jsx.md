# ToastHost.jsx

Source: [`src/components/ToastHost.jsx`](../../../../../src/components/ToastHost.jsx)

The stack of notifications, bottom right of the window (fixed, above everything, `aria-live="polite"`), drawn from the store of [toasts.js](../../lib/toasts.js.md): it subscribes on mount and renders nothing while the list is empty.

- Each notification has a coloured left bar and an icon per level — info (`Info`, accent), success (`CheckCircle2`, emerald), warning (`AlertTriangle`, amber), error (`XCircle`, rose) — and its role is `alert` for errors and `status` for the rest.
- The message is clamped to three lines; when the notification carries a `detail` (the stack of an error), clicking the text expands it in a `<pre>` of at most 40 units of height, with the text selectable; a `×N` badge appears when the same notification arrived more than once.
- Hovering the notification calls `hold(id)` of the store, leaving it calls `release(id)`, so it is not dismissed while it is being read.
- Two small buttons: Copy (writes message and detail to the clipboard, showing a check for a second and a half) and Close (`dismiss(id)`).
- Colours come from the theme variables, so the light theme follows them without changes.
