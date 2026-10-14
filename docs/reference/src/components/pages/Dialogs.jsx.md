---
# Dialogs.jsx

Source: [`src/components/Dialogs.jsx`](../../../../../src/components/Dialogs.jsx)

Internal dialog window for confirmations and text requests, used instead of `window.confirm` and `window.prompt`: in Electron `prompt` does not exist and `confirm` leaves the window with a broken focus (fields and selects cannot be selected).

- `DialogProvider`: wraps the application and renders the open dialog. It returns the focus to the element that opened it when the dialog closes.
- `useDialogs()`: the API of the current provider:
  - `confirm(message, options)`: a yes/no confirmation, resolving to a boolean; `danger` colors the confirm button red and `confirmLabel` replaces "OK".
  - `choose(message, choices)`: a choice among several buttons, resolving to the chosen `value` or `null` when cancelled; each choice can be `primary` or `danger`.
  - `prompt(message, initial, options)`: a single-line text request, resolving to the text or `null`.

`DialogBox` is the shared window: a form with the message, an input for `prompt`, and the buttons. Escape or a click on the backdrop cancels (resolving to `false`, or `null` for `prompt` and `choose`).

